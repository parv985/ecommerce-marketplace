import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AdminAuditPage } from "./AdminAuditPage";
import type { AuditLog, AuditLogQuery } from "@/types/api";

/*
 * Component coverage for the redesigned Super Admin Audit Log page:
 * compact toolbar (search + Filters popover + sort dropdown), active
 * filter chips, expandable rows, copy-to-clipboard ids and the fact
 * that every filter/search/sort/page-size change goes to the server
 * as query parameters.
 */

const getAuditLogs = vi.hoisted(() => vi.fn());

vi.mock("@/services/admin.service", () => ({
  adminService: {
    getAuditLogs: (...args: unknown[]) => getAuditLogs(...args),
  },
}));

vi.mock("@/services/api", () => ({
  extractErrorMessage: () => "Something went wrong",
}));

const ACTOR_ID = "65f1c2b0a1b2c3d4e5f60717";
const ENTITY_ID = "65f1c2b0a1b2c3d4e5f60716";

const log = (overrides: Partial<AuditLog>): AuditLog => ({
  id: "65f1c2b0a1b2c3d4e5f60718",
  actorId: ACTOR_ID,
  actorName: "Parv Sharma",
  actorEmail: "parv@nexcart.test",
  actorRole: "SUPER_ADMIN",
  action: "USER_STATUS_UPDATE",
  entityType: "USER",
  entityId: ENTITY_ID,
  before: { isActive: true },
  after: { isActive: false },
  metadata: null,
  createdAt: "2026-02-14T09:12:44.221Z",
  ...overrides,
});

const ITEMS: AuditLog[] = [
  log({}),
  log({
    id: "65f1c2b0a1b2c3d4e5f60719",
    actorId: "system",
    actorName: null,
    actorEmail: null,
    actorRole: "SYSTEM",
    action: "PAYMENT_CAPTURED",
    entityType: "ORDER",
    entityId: null,
    before: null,
    after: null,
  }),
];

let queryClient: QueryClient;

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminAuditPage />
    </QueryClientProvider>,
  );
}


/** Open a MUI Select (combobox) and pick one of its rendered options. */
async function pickSelect(combo: HTMLElement, optionText: string | RegExp) {
  fireEvent.mouseDown(combo);
  const listbox = await screen.findByRole("listbox");
  const option =
    typeof optionText === "string"
      ? within(listbox).getByText(optionText)
      : within(listbox).getByText(optionText);
  fireEvent.click(option);
}

const lastQuery = (): AuditLogQuery => {
  const call = getAuditLogs.mock.calls.at(-1);
  return call?.[0] as AuditLogQuery;
};

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  getAuditLogs.mockResolvedValue({
    items: ITEMS,
    page: 1,
    limit: 20,
    total: ITEMS.length,
    totalPages: 1,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AdminAuditPage", () => {
  it("renders the compact toolbar (search, filters, sort) instead of a large filter form", async () => {
    renderPage();

    expect(await screen.findByRole("textbox", { name: /search audit logs/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /sort audit logs/i })).toBeInTheDocument();

    // The seven advanced filters live inside the popover, not on the page
    expect(screen.queryByText("Advanced filters")).not.toBeInTheDocument();
  });

  it("shows the audit table with timestamp, action, actor, entity and changes", async () => {
    renderPage();

    expect(await screen.findByText("USER_STATUS_UPDATE")).toBeInTheDocument();
    expect(screen.getByText("PAYMENT_CAPTURED")).toBeInTheDocument();

    // Human-readable actor identity + role badge
    expect(screen.getByText("Parv Sharma")).toBeInTheDocument();
    expect(screen.getByText("SUPER_ADMIN")).toBeInTheDocument();
    // Shortened ObjectIds are rendered (with full ids available via copy)
    expect(screen.getByText(`${ACTOR_ID.slice(0, 6)}…${ACTOR_ID.slice(-4)}`)).toBeInTheDocument();
  });

  it("debounces free-text search into a server-side query parameter", async () => {
    vi.useFakeTimers();
    renderPage();
    await act(async () => {});
    expect(getAuditLogs).toHaveBeenCalledTimes(1);

    const input = screen.getByRole("textbox", { name: /search audit logs/i });
    fireEvent.change(input, { target: { value: "payment" } });

    // Not called again before the debounce elapses
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(getAuditLogs).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(getAuditLogs).toHaveBeenCalledTimes(2);
    expect(lastQuery().search).toBe("payment");

    vi.useRealTimers();
  });

  it("opens the Filters popover with all seven advanced filters and applies them", async () => {
    renderPage();
    await screen.findByText("USER_STATUS_UPDATE");

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    expect(await screen.findByText("Advanced filters")).toBeInTheDocument();

    expect(screen.getByLabelText("Actor ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Entity ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Actor role")).toBeInTheDocument();
    expect(screen.getByLabelText("Action")).toBeInTheDocument();
    expect(screen.getByLabelText("Entity type")).toBeInTheDocument();
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByLabelText("To date")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Actor ID"), {
      target: { value: ACTOR_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: /^apply filters$/i }));

    await waitFor(() => expect(lastQuery().actorId).toBe(ACTOR_ID));

    // The applied filter shows up as a removable chip
    expect(screen.getByText(`Actor ID: ${ACTOR_ID}`)).toBeInTheDocument();
  });

  it("removes a single filter via its chip", async () => {
    renderPage();
    await screen.findByText("USER_STATUS_UPDATE");

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    await pickSelect(await screen.findByLabelText("Actor role"), "SUPER_ADMIN");
    fireEvent.click(screen.getByRole("button", { name: /^apply filters$/i }));

    expect(await screen.findByText("Role: SUPER_ADMIN")).toBeInTheDocument();
    const callsWithFilter = getAuditLogs.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /remove role filter/i }));
    await waitFor(() => expect(lastQuery().actorRole).toBeUndefined());
    expect(screen.queryByText("Role: SUPER_ADMIN")).not.toBeInTheDocument();
    expect(getAuditLogs.mock.calls.length).toBeGreaterThan(callsWithFilter);
  });

  it("resets all filters (toolbar Clear all + popover Reset)", async () => {
    renderPage();
    await screen.findByText("USER_STATUS_UPDATE");

    // Apply two filters via the popover
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.change(await screen.findByLabelText("Actor ID"), {
      target: { value: ACTOR_ID },
    });
    await pickSelect(screen.getByLabelText("Entity type"), "USER");
    fireEvent.click(screen.getByRole("button", { name: /^apply filters$/i }));

    expect(await screen.findByText(`Actor ID: ${ACTOR_ID}`)).toBeInTheDocument();
    expect(screen.getByText("Entity: USER")).toBeInTheDocument();

    // Reset from the popover
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset filters/i }));

    await waitFor(() => {
      const q = lastQuery();
      expect(q.actorId).toBeUndefined();
      expect(q.entityType).toBeUndefined();
    });
    expect(screen.queryByText(`Actor ID: ${ACTOR_ID}`)).not.toBeInTheDocument();
  });

  it("keeps server-side sort/page controls and changes the query, not the data", async () => {
    renderPage();
    await screen.findByText("USER_STATUS_UPDATE");

    // Quick sort dropdown flips to oldest-first
    await pickSelect(screen.getByRole("combobox", { name: /sort audit logs/i }), "Oldest first");
    await waitFor(() => {
      expect(lastQuery().sortBy).toBe("createdAt");
      expect(lastQuery().sortOrder).toBe("asc");
    });

    // Page size select reaches the server too
    await pickSelect(screen.getAllByRole("combobox", { name: /rows per page/i })[0], "50 / page");
    await waitFor(() => expect(lastQuery().limit).toBe(50));
  });

  it("copies actor and entity ids to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderPage();
    await screen.findByText("USER_STATUS_UPDATE");

    const copyButtons = screen.getAllByRole("button", { name: /copy actor id/i });
    fireEvent.click(copyButtons[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ACTOR_ID));

    fireEvent.click(screen.getAllByRole("button", { name: /copy entity id/i })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ENTITY_ID));
  });

  it("expands a row to show full details (ids, before/after, metadata)", async () => {
    renderPage();
    await screen.findByText("USER_STATUS_UPDATE");

    fireEvent.click(screen.getAllByRole("button", { name: /show details/i })[0]);

    // Full (untruncated) ids become visible in the details panel
    expect(await screen.findByText(ENTITY_ID)).toBeInTheDocument();
    expect(screen.getByText("Entry id")).toBeInTheDocument();
    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /hide details/i })[0]);
  });

  it("shows a friendly empty state when filters match nothing", async () => {
    getAuditLogs.mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });

    renderPage();
    expect(
      await screen.findByText(/no audit entries yet/i),
    ).toBeInTheDocument();
  });
});
