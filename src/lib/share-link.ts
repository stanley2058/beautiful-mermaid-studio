import { deflateSync, inflateSync } from "fflate";

const SHARE_VERSION = "v1";
const SHARE_ALGORITHM = "d";
const SHARE_PREFIX = `${SHARE_VERSION}.${SHARE_ALGORITHM}.`;
const SHARE_PARAM = "diagram";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  if (!encoded) {
    throw new Error("Share link payload is empty.");
  }
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function supportsCompressionStream(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

function toArrayBufferBackedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

async function compressBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (supportsCompressionStream()) {
    const stream = new Blob([toArrayBufferBackedBytes(bytes)]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return deflateSync(bytes, { level: 9 });
}

async function decompressBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (supportsCompressionStream()) {
    const stream = new Blob([toArrayBufferBackedBytes(bytes)]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return inflateSync(bytes);
}

function getPayloadFromToken(token: string): string {
  if (token.startsWith(SHARE_PREFIX)) {
    return token.slice(SHARE_PREFIX.length);
  }
  if (token.startsWith(`${SHARE_VERSION}.`)) {
    throw new Error("Unsupported share link format version.");
  }
  return token;
}

export async function encodeDiagramToken(source: string): Promise<string> {
  const compressed = await compressBytes(textEncoder.encode(source));
  return `${SHARE_PREFIX}${bytesToBase64Url(compressed)}`;
}

export async function decodeDiagramToken(token: string): Promise<string> {
  const compressed = base64UrlToBytes(getPayloadFromToken(token));
  const decompressed = await decompressBytes(compressed);
  return textDecoder.decode(decompressed);
}

export function readDiagramTokenFromUrl(url: URL): string | null {
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  return hashParams.get(SHARE_PARAM) ?? url.searchParams.get(SHARE_PARAM);
}

export function writeDiagramTokenToUrl(url: URL, token: string): URL {
  const nextUrl = new URL(url.toString());
  const hashParams = new URLSearchParams(nextUrl.hash.startsWith("#") ? nextUrl.hash.slice(1) : nextUrl.hash);
  hashParams.set(SHARE_PARAM, token);
  nextUrl.hash = hashParams.toString();
  nextUrl.searchParams.delete(SHARE_PARAM);
  return nextUrl;
}

export function clearDiagramTokenFromUrl(url: URL): URL {
  const nextUrl = new URL(url.toString());
  const hashParams = new URLSearchParams(nextUrl.hash.startsWith("#") ? nextUrl.hash.slice(1) : nextUrl.hash);
  hashParams.delete(SHARE_PARAM);
  nextUrl.hash = hashParams.toString();
  nextUrl.searchParams.delete(SHARE_PARAM);
  return nextUrl;
}
