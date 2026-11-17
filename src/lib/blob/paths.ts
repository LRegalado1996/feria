import {
  detectStableEnvironment,
  isVercelPreviewDeploy,
} from "@/lib/env/deploy";
import {
  IMAGE_PURPOSES,
  type ImagePurpose,
  type UploadContentType,
} from "@/lib/schemas/upload";

/**
 * The folder at the root of the Blob store every upload of a deployment
 * goes under. qa, previews and local runs share one store (README §
 * Project setup) while each has its own database, so each keeps to its own
 * folder: the orphan cleanup of one never sees another's files, which its
 * database does not list.
 */
export type BlobNamespace = "local" | "preview" | "production" | "qa";

type DeployEnv = Record<string, string | undefined>;

/** This deployment's folder: `production`, `qa`, `preview`, else `local`. */
export function blobNamespace(env: DeployEnv = process.env): BlobNamespace {
  const stable = detectStableEnvironment(env);

  if (stable) {
    return stable;
  }

  return isVercelPreviewDeploy(env) ? "preview" : "local";
}

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const satisfies Record<UploadContentType, string>;

/**
 * Where an upload lands: `<namespace>/<purpose>/<id>.<ext>`. The server
 * picks it and signs it into the token, so a browser never names a path.
 */
export function blobPathname({
  contentType,
  id,
  namespace,
  purpose,
}: {
  contentType: UploadContentType;
  id: string;
  namespace: BlobNamespace;
  purpose: ImagePurpose;
}): string {
  return `${namespace}/${purpose}/${id}.${EXTENSIONS[contentType]}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const OWN_PATHNAME = new RegExp(
  `^/([a-z]+)/([a-z]+)/${UUID}\\.(?:jpg|png|webp)$`
);

/**
 * Whether `url` is a file this deployment uploaded: HTTPS on its own Blob
 * store's host, in its own folder (and the purpose's, when given), named as
 * `blobPathname` names one, with no query, fragment, port or credentials.
 * A stored address must pass before it is saved, and only one that passes
 * is ever deleted.
 */
export function isOwnBlobUrl(
  url: string,
  {
    host,
    namespace,
    purpose,
  }: { host: string; namespace: BlobNamespace; purpose?: ImagePurpose }
): boolean {
  if (!URL.canParse(url)) {
    return false;
  }

  const parsed = new URL(url);
  const [, folder, kind] = OWN_PATHNAME.exec(parsed.pathname) ?? [];

  return (
    parsed.protocol === "https:" &&
    parsed.hostname === host &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.search === "" &&
    parsed.hash === "" &&
    folder === namespace &&
    (purpose === undefined
      ? IMAGE_PURPOSES.some((known) => known === kind)
      : kind === purpose)
  );
}
