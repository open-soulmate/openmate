declare module 'shapefile' {
  interface GeoJSON {
    type: string;
    features: unknown[];
    [key: string]: unknown;
  }
  export function read(buffer: ArrayBuffer): Promise<GeoJSON>;
  export function open(path: string): Promise<{ read(): Promise<GeoJSON> }>;
}
