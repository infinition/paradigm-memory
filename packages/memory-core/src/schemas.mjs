const number01 = {
  type: "number",
  minimum: 0,
  maximum: 1
};

export const memoryNodeSchema = {
  type: "object",
  required: ["id", "label"],
  properties: {
    id: { type: "string", minLength: 1 },
    parent_id: { type: ["string", "null"] },
    label: { type: "string", minLength: 1 },
    summary: { type: "string" },
    one_liner: { type: "string" },
    node_type: { type: "string" },
    status: { type: "string" },
    importance: number01,
    activation: number01,
    confidence: number01,
    freshness: number01,
    retrieval_policy: { type: ["object", "null"] },
    keywords: { type: "array", items: { type: "string" } },
    children: { type: "array", items: { type: "string" } },
    links: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "string" } },
    stats: { type: "object" }
  }
};

export const memoryItemSchema = {
  type: "object",
  required: ["id", "node_id", "content"],
  properties: {
    id: { type: "string", minLength: 1 },
    node_id: { type: "string", minLength: 1 },
    content: { type: "string", minLength: 1 },
    tags: { type: "array", items: { type: "string" } },
    source: { type: "string" },
    created_at: { type: ["string", "null"] },
    updated_at: { type: ["string", "null"] },
    importance: number01,
    confidence: number01,
    expires_at: { type: ["string", "null"] },
    status: { type: "string" },
    deleted_at: { type: ["string", "null"] },
    supersedes: { type: ["string", "null"] }
  }
};

export const memoryMutationSchema = {
  type: "object",
  required: ["operation"],
  properties: {
    operation: { type: "string", minLength: 1 },
    item_id: { type: ["string", "null"] },
    node_id: { type: ["string", "null"] },
    reason: { type: "string" },
    actor: { type: "string" },
    payload: { type: "object" }
  }
};

export const memoryTraceSchema = {
  type: "object",
  required: ["id", "at", "operation", "input", "steps"],
  properties: {
    id: { type: "string", minLength: 1 },
    at: { type: "string", minLength: 1 },
    operation: { type: "string", minLength: 1 },
    input: { type: "object" },
    steps: { type: "object" },
    result: { type: "object" },
    error: { type: "object" }
  }
};

function typeMatches(value, expected) {
  if (Array.isArray(expected)) return expected.some((type) => typeMatches(value, type));
  if (expected === "array") return Array.isArray(value);
  if (expected === "null") return value === null || value === undefined;
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === expected;
}

function assertSchema(value, schema, path = "value") {
  if (!typeMatches(value, schema.type)) {
    throw new Error(`${path} must be ${Array.isArray(schema.type) ? schema.type.join("|") : schema.type}`);
  }

  for (const key of schema.required ?? []) {
    if (value[key] === undefined || value[key] === null || value[key] === "") {
      throw new Error(`${path}.${key} is required`);
    }
  }

  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    const current = value[key];
    if (current === undefined) continue;
    const propertyPath = `${path}.${key}`;
    if (!typeMatches(current, property.type)) {
      throw new Error(`${propertyPath} must be ${Array.isArray(property.type) ? property.type.join("|") : property.type}`);
    }
    if (property.minLength !== undefined && String(current).length < property.minLength) {
      throw new Error(`${propertyPath} must be at least ${property.minLength} chars`);
    }
    if (property.minimum !== undefined && current < property.minimum) {
      throw new Error(`${propertyPath} must be >= ${property.minimum}`);
    }
    if (property.maximum !== undefined && current > property.maximum) {
      throw new Error(`${propertyPath} must be <= ${property.maximum}`);
    }
    if (property.type === "array" && property.items) {
      current.forEach((item, index) => assertSchema(item, property.items, `${propertyPath}[${index}]`));
    }
  }

  return value;
}

export function validateMemoryNode(node) {
  return assertSchema(node, memoryNodeSchema, "memory_node");
}

export function validateMemoryItem(item) {
  return assertSchema(item, memoryItemSchema, "memory_item");
}

export function validateMemoryMutation(mutation) {
  return assertSchema(mutation, memoryMutationSchema, "memory_mutation");
}

export function validateMemoryTrace(trace) {
  return assertSchema(trace, memoryTraceSchema, "memory_trace");
}
