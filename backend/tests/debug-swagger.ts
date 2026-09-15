import { swaggerSpec } from "../src/docs/swagger.js";

const paths = Object.keys(swaggerSpec.paths).sort();
const documented: string[] = [];

for (const [path, methods] of Object.entries(
  swaggerSpec.paths,
)) {
  for (const [method, op] of Object.entries(
    methods as Record<string, any>,
  )) {
    if (
      [
        "get",
        "post",
        "patch",
        "put",
        "delete",
      ].includes(method)
    ) {
      documented.push(`${method.toUpperCase()} ${path}`);
    }
  }
}

console.log(`total documented ops: ${documented.length}`);

const dupIds = new Map<string, number>();

for (const [path, methods] of Object.entries(
  swaggerSpec.paths,
)) {
  for (const [method, op] of Object.entries(
    methods as Record<string, any>,
  )) {
    if (!op.operationId) continue;
    dupIds.set(
      op.operationId,
      (dupIds.get(op.operationId) ?? 0) + 1,
    );
  }
}

const duplicates = [...dupIds.entries()].filter(
  ([, count]) => count > 1,
);

console.log(
  `duplicate operationIds: ${duplicates.length}`,
);

const refs = [
  ...new Set(
    JSON.stringify(swaggerSpec).match(
      /"#\/components\/schemas\/[A-Za-z]+"/g,
    ) ?? [],
  ),
].map((ref) => ref.slice(1, -1));

const missingRefs = refs.filter((ref) => {
  const name = ref.split("/").pop()!;
  return !swaggerSpec.components?.schemas?.[name];
});

console.log(`unresolvable refs: ${missingRefs.length}`);

const discountPaths = paths.filter((p) =>
  p.includes("discounts"),
);

console.log(
  `discount paths: ${discountPaths.join(", ")}`,
);

const missingTags = [
  ...new Set(
    documented.map((op) => {
      const [m, p] = op.split(" ");
      const pathObj = (swaggerSpec.paths as any)[p];
      const opObj = pathObj[m.toLowerCase()];
      return (opObj.tags ?? ["UNTAGGED"])[0];
    }),
  ),
];

console.log(`tags in use: ${missingTags.join(", ")}`);
