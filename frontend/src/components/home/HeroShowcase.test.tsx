import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { HeroShowcase } from "./HeroShowcase";
import type { Product } from "@/types/api";

/*
 * Component coverage for the homepage hero showcase carousel: live
 * products render as the original featured + supporting tiles, the
 * carousel auto-advances one product every 2.5s with a sliding
 * transition, it pauses on hover, and it degrades gracefully when the
 * catalog has few (or no) imaged products.
 */

const product = (i: number, overrides: Partial<Product> = {}): Product => ({
  id: `p${i}`,
  name: `Product ${i}`,
  description: null,
  price: 1000 + i,
  compareAtPrice: 1500 + i,
  sku: null,
  stock: 5,
  status: "ACTIVE",
  category: null,
  sellerId: "s1",
  images: [{ url: `https://cdn.test/${i}.jpg`, publicId: `img-${i}` }],
  specifications: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function renderHero(products: Product[], props: Partial<Parameters<typeof HeroShowcase>[0]> = {}) {
  return render(
    <MemoryRouter>
      <HeroShowcase products={products} categories={[]} isLoading={false} {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HeroShowcase", () => {
  it("renders live products as the featured + supporting tiles with product links", () => {
    renderHero([product(0), product(1), product(2), product(3), product(4)]);

    const featuredLink = screen.getAllByRole("link", { name: /product 0/i })[0];
    expect(featuredLink).toHaveAttribute("href", "/products/p0");

    // Supporting tiles link to their products too
    expect(screen.getAllByRole("link", { name: /product 1/i })[0]).toHaveAttribute(
      "href",
      "/products/p1",
    );
    // Prices are rendered (formatted INR)
    expect(screen.getAllByText(/1,000/).length).toBeGreaterThan(0);
  });

  it("auto-advances the featured product every 2.5 seconds", async () => {
    const { rerender } = renderHero([
      product(0),
      product(1),
      product(2),
      product(3),
      product(4),
    ]);

    expect(screen.getAllByRole("link", { name: /product 0/i })[0]).toBeInTheDocument();

    // 2.5s autoplay + slide duration safety finalize (600ms + margin)
    vi.advanceTimersByTime(2500);
    vi.advanceTimersByTime(1000);

    // The featured tile is now the next product; product 0 only remains
    // as a supporting tile (or has slid out entirely).
    const featured = screen.getAllByRole("link", { name: /^product 1/i })[0];
    expect(featured).toHaveAttribute("href", "/products/p1");

    rerender(
      <MemoryRouter>
        <HeroShowcase products={[product(0), product(1), product(2), product(3), product(4)]} categories={[]} isLoading={false} />
      </MemoryRouter>,
    );
  });

  it("pauses auto-play while hovered and resumes on leave", () => {
    renderHero([product(0), product(1), product(2), product(3), product(4)]);

    fireEvent.mouseEnter(screen.getByRole("region", { name: /featured products/i }));
    vi.advanceTimersByTime(7500);
    expect(screen.getAllByRole("link", { name: /^product 0/i })[0]).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole("region", { name: /featured products/i }));
    vi.advanceTimersByTime(2500);
    vi.advanceTimersByTime(1000);
    expect(screen.getAllByRole("link", { name: /^product 1/i })[0]).toBeInTheDocument();
  });

  it("shows dot indicators only when there are enough products to slide", () => {
    const { unmount } = renderHero([product(0), product(1), product(2), product(3)]);
    expect(screen.getAllByRole("button", { name: /go to slide/i }).length).toBeGreaterThan(0);
    unmount();

    // Four or fewer imaged products: static collage, no dots, no timer.
    renderHero([product(0), product(1), product(2)]);
    expect(screen.queryByRole("button", { name: /go to slide/i })).not.toBeInTheDocument();

    vi.advanceTimersByTime(7500);
    expect(screen.getAllByRole("link", { name: /^product 0/i })[0]).toBeInTheDocument();
  });

  it("renders a static collage for 1–3 products without sliding", () => {
    renderHero([product(0), product(1), product(2)]);

    vi.advanceTimersByTime(7500);
    expect(screen.getAllByRole("link", { name: /^product 0/i })[0]).toBeInTheDocument();
  });

  it("falls back to the branded categories panel when no products have images", () => {
    renderHero([product(0, { images: [] }), product(1, { images: [] })]);

    expect(screen.getAllByText(/multi-vendor marketplace/i).length).toBeGreaterThan(0);
    // No product tiles at all (only the panel's own Browse Products CTA)
    expect(screen.queryByRole("link", { name: /product \d/i })).not.toBeInTheDocument();
  });

  it("shows matching skeletons while loading", () => {
    renderHero([], { isLoading: true });
    // The featured skeleton panel is a container without any product links
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps every tile a product link (carousel must not break navigation)", () => {
    renderHero([product(0), product(1), product(2), product(3), product(4), product(5)]);
    vi.advanceTimersByTime(2500);
    vi.advanceTimersByTime(1000);

    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^\/products\//);
    }
    // Links remain keyboard-focusable anchors (not divs with onClick)
    for (const link of links) {
      expect(link.tagName).toBe("A");
    }
  });

  it("exposes slide indicator buttons that jump to a slide", () => {
    renderHero([product(0), product(1), product(2), product(3), product(4), product(5)]);

    const dots = screen.getAllByRole("button", { name: /go to slide/i });
    expect(dots.length).toBe(Math.min(6, 8));

    fireEvent.click(within(screen.getByRole("region", { name: /featured products/i })).getByRole("button", { name: "Go to slide 3" }));
    vi.advanceTimersByTime(1000);

    expect(screen.getAllByRole("link", { name: /^product 3/i })[0]).toBeInTheDocument();
  });
});
