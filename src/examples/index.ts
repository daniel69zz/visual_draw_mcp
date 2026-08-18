import type { Scene } from "../scene/types.js";

/**
 * Reference scenes.
 *
 * They double as documentation for the model (the `list_examples` /
 * `get_example` tools serve them verbatim) and as fixtures for the tests.
 * Each one shows a different part of the system, and none of them contains a
 * single SVG coordinate that a human had to compute.
 */

export const networkExample: Scene = {
  id: "example-network",
  title: "Inter-VLAN communication",
  subtitle: "A host in VLAN 20 reaching a server in VLAN 10",
  theme: "dark",
  layout: "auto",
  direction: "right",
  elements: [
    { id: "pc", type: "computer", label: "PC", sublabel: "192.168.20.10 - VLAN 20" },
    { id: "switch", type: "switch", label: "Switch L2", sublabel: "trunk 802.1Q" },
    { id: "router", type: "router", label: "Router", sublabel: "router-on-a-stick" },
    { id: "server", type: "server", label: "Server", sublabel: "192.168.10.10 - VLAN 10" },
    { id: "c1", type: "connection", from: "pc", to: "switch", label: "access 20" },
    { id: "c2", type: "connection", from: "switch", to: "router", label: "trunk" },
    { id: "c3", type: "connection", from: "router", to: "server", label: "access 10" },
  ],
};

export const ldaExample: Scene = {
  id: "example-lda",
  title: "Linear Discriminant Analysis",
  subtitle: "LDA finds the projection that separates the classes best",
  theme: "dark",
  elements: [
    {
      id: "plot",
      type: "axis",
      x: 90,
      y: 70,
      width: 620,
      height: 420,
      xRange: [0, 10],
      yRange: [0, 10],
      xLabel: "Feature 1",
      yLabel: "Feature 2",
      ticks: 5,
    },
    {
      id: "class-a",
      type: "cluster",
      frame: "plot",
      x: 3.4,
      y: 6.6,
      count: 40,
      spread: 0.8,
      spreadY: 0.85,
      fill: "primary",
      label: "Class A",
      hull: true,
      seed: 7,
    },
    {
      id: "class-b",
      type: "cluster",
      frame: "plot",
      x: 6.8,
      y: 3.6,
      count: 40,
      spread: 0.8,
      spreadY: 0.85,
      shape: "cross",
      fill: "secondary",
      label: "Class B",
      hull: true,
      seed: 23,
    },
    {
      id: "boundary",
      type: "plotLine",
      frame: "plot",
      from: [2, 1.6],
      to: [8, 8.4],
      stroke: "foreground",
      dash: "dashed",
      extend: true,
      label: "decision boundary",
    },
    {
      id: "projection",
      type: "plotLine",
      frame: "plot",
      from: [1.6, 8.6],
      to: [8.4, 1.4],
      stroke: "success",
      label: "LDA direction",
    },
  ],
};

export const regressionExample: Scene = {
  id: "example-regression",
  title: "Linear regression",
  subtitle: "The line that minimises the squared error",
  theme: "light",
  elements: [
    {
      id: "plot",
      type: "axis",
      x: 90,
      y: 70,
      width: 600,
      height: 400,
      xRange: [0, 10],
      yRange: [0, 10],
      xLabel: "x",
      yLabel: "y",
      ticks: 5,
    },
    {
      id: "observations",
      type: "scatter",
      frame: "plot",
      fill: "primary",
      radius: 5,
      label: "observations",
      points: [
        [0.8, 1.6], [1.4, 2.4], [2.1, 2.2], [2.6, 3.6], [3.2, 3.1],
        [3.9, 4.6], [4.4, 4.1], [5.1, 5.5], [5.7, 5.1], [6.3, 6.4],
        [6.9, 6.0], [7.5, 7.3], [8.1, 7.0], [8.8, 8.2], [9.3, 7.9],
      ],
    },
    {
      id: "fit",
      type: "plotLine",
      frame: "plot",
      from: [0, 1.2],
      to: [10, 8.6],
      stroke: "danger",
      strokeWidth: 2.6,
      label: "y = 0.74x + 1.2",
      extend: true,
    },
  ],
};

export const architectureExample: Scene = {
  id: "example-architecture",
  title: "Web application architecture",
  theme: "dark",
  layout: "auto",
  direction: "right",
  elements: [
    { id: "frontend", type: "node", label: "React", sublabel: "SPA", emphasis: "strong" },
    { id: "api", type: "node", label: "REST API", sublabel: "NestJS", shape: "rounded" },
    {
      id: "data",
      type: "group",
      label: "Data layer",
      layout: "vertical",
      gap: 34,
      children: [
        { id: "cache", type: "database", label: "Redis", sublabel: "cache", fill: "#3A1F2B" },
        { id: "db", type: "database", label: "PostgreSQL", sublabel: "primary" },
      ],
    },
    { id: "c1", type: "connection", from: "frontend", to: "api", label: "HTTPS / JSON" },
    { id: "c2", type: "connection", from: "api", to: "db", label: "SQL" },
    { id: "c3", type: "connection", from: "api", to: "cache", label: "GET/SET", dash: "dashed" },
  ],
};

export const treeExample: Scene = {
  id: "example-tree",
  title: "Balanced binary tree",
  theme: "dark",
  layout: "layered",
  direction: "down",
  gap: 70,
  elements: [
    { id: "n8", type: "node", shape: "circle", label: "8", emphasis: "strong" },
    { id: "n4", type: "node", shape: "circle", label: "4" },
    { id: "n12", type: "node", shape: "circle", label: "12" },
    { id: "n2", type: "node", shape: "circle", label: "2" },
    { id: "n6", type: "node", shape: "circle", label: "6" },
    { id: "n10", type: "node", shape: "circle", label: "10" },
    { id: "n14", type: "node", shape: "circle", label: "14" },
    { id: "e1", type: "connection", from: "n8", to: "n4", arrow: false },
    { id: "e2", type: "connection", from: "n8", to: "n12", arrow: false },
    { id: "e3", type: "connection", from: "n4", to: "n2", arrow: false },
    { id: "e4", type: "connection", from: "n4", to: "n6", arrow: false },
    { id: "e5", type: "connection", from: "n12", to: "n10", arrow: false },
    { id: "e6", type: "connection", from: "n12", to: "n14", arrow: false },
  ],
};

export const EXAMPLES: Record<string, { scene: Scene; description: string }> = {
  network: {
    scene: networkExample,
    description:
      "Network topology with domain presets (computer/switch/router/server) and automatic left-to-right layout.",
  },
  lda: {
    scene: ldaExample,
    description:
      "Machine-learning explanation: an axis data frame, two generated clusters and a decision boundary in data coordinates.",
  },
  regression: {
    scene: regressionExample,
    description: "Chart-style scene: axis, scatter series and a fitted line, on the light theme.",
  },
  architecture: {
    scene: architectureExample,
    description:
      "Software architecture with a labelled group ('Data layer') and connections that route into it.",
  },
  tree: {
    scene: treeExample,
    description: "Binary tree using the layered layout flowing downwards.",
  },
};

export type ExampleName = keyof typeof EXAMPLES;
