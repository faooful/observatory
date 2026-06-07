export type OsrsSceneCameraPreset = {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  projection: "orthographic";
  zoom: number;
};

export type OsrsMapSquareAsset = {
  mapX: number;
  mapY: number;
  vertexCount: number;
  indexCount: number;
  positions: string;
  colors: string;
  indices: string;
};

export type OsrsOverviewAsset = {
  globeTexture: string;
  planeTexture: string;
};

export type OsrsTexturePyramid = {
  atlas: string;
  tileSize: number;
  columns: number;
  rows: number;
  levels: Array<{
    id: string;
    kind: "globe" | "plane";
    tiles: string[];
  }>;
};

export type OsrsProjectionSettings = {
  type: "globe-to-plane";
  radius: number;
  worldWidth: number;
  worldDepth: number;
};

export type OsrsSceneLodThresholds = {
  globeDistance: number;
  planeDistance: number;
  closeDistance: number;
  closeChunkRadius: number;
};

export type OsrsSceneManifest = {
  cacheName: string;
  cacheId: number;
  revision: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  overview?: OsrsOverviewAsset;
  texturePyramid?: OsrsTexturePyramid;
  projection?: OsrsProjectionSettings;
  validMapSquares?: Array<{ mapX: number; mapY: number }>;
  lod?: OsrsSceneLodThresholds;
  defaultCamera: OsrsSceneCameraPreset;
  chunks: OsrsMapSquareAsset[];
};
