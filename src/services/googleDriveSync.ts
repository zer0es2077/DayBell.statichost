import type { PersonalSyncPayload, SharedClassPayload } from '../types';

const PERSONAL_SYNC_FILENAME = 'daybell-personal-sync.json';
const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

export class DriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveAuthError';
  }
}

export class DriveScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveScopeError';
  }
}

interface GoogleApiErrorBody {
  error?: {
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string; message?: string }>;
    details?: Array<{ reason?: string }>;
  };
}

async function inspectForbiddenResponse(res: Response): Promise<void> {
  try {
    const body = (await res.clone().json()) as GoogleApiErrorBody;
    const reasons = [
      ...(body.error?.errors?.map((e) => e.reason ?? '') ?? []),
      ...(body.error?.details?.map((d) => d.reason ?? '') ?? []),
      body.error?.status ?? '',
    ].join(' ');
    const message = body.error?.message ?? '';

    if (
      /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i.test(
        `${reasons} ${message}`,
      )
    ) {
      throw new DriveScopeError(
        'Google Drive permissions were not granted. Please sign in again and tick the Google Drive checkboxes.',
      );
    }
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(`${reasons} ${message}`)) {
      throw new Error(
        'Google Drive API is not enabled in the linked Google Cloud project yet. Enable "Google Drive API" in Google Cloud Console.',
      );
    }
  } catch (err) {
    if (err instanceof DriveScopeError) {
      throw err;
    }
    if (err instanceof Error && err.message.includes('Google Drive API is not enabled')) {
      throw err;
    }
  }
}

async function driveFetch(url: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  if (res.status === 401) {
    throw new DriveAuthError('Google session expired. Please sign in again.');
  }
  if (res.status === 403) {
    await inspectForbiddenResponse(res);
  }
  return res;
}

/**
 * Extracts a Google Drive File ID from either a raw ID or a full Google Drive share URL.
 */
export function extractDriveFileId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const pathMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (pathMatch?.[1]) return pathMatch[1];
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (queryMatch?.[1]) return queryMatch[1];
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '');
}

async function findPersonalSyncFile(
  accessToken: string,
): Promise<{ id: string; modifiedTime: string | null } | null> {
  const q = encodeURIComponent(`name='${PERSONAL_SYNC_FILENAME}' and trashed=false`);
  const url = `${DRIVE_FILES_API}?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=1`;
  const res = await driveFetch(url, accessToken);
  if (!res.ok) {
    throw new Error(`Google Drive lookup failed (${res.status}).`);
  }
  const data = (await res.json()) as { files?: Array<{ id: string; modifiedTime?: string }> };
  const first = data.files?.[0];
  if (!first?.id) return null;
  return { id: first.id, modifiedTime: first.modifiedTime ?? null };
}

async function findPersonalSyncFileId(accessToken: string): Promise<string | null> {
  const found = await findPersonalSyncFile(accessToken);
  return found?.id ?? null;
}

/**
 * Performs a lightweight read-only check right after sign-in to confirm Drive scopes
 * are active and detect if a personal DayBell backup already exists.
 */
export async function verifyDriveAccess(
  accessToken: string,
): Promise<{ hasBackup: boolean; backupModifiedTime: string | null }> {
  const found = await findPersonalSyncFile(accessToken);
  return {
    hasBackup: Boolean(found),
    backupModifiedTime: found?.modifiedTime ?? null,
  };
}

export async function loadPersonalSyncFromDrive(
  accessToken: string,
): Promise<{ fileId: string; payload: PersonalSyncPayload } | null> {
  const fileId = await findPersonalSyncFileId(accessToken);
  if (!fileId) return null;

  const res = await driveFetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?alt=media`, accessToken);
  if (!res.ok) {
    throw new Error(`Could not read sync file from Google Drive (${res.status}).`);
  }
  const payload = (await res.json()) as PersonalSyncPayload;
  if (!payload || payload.kind !== 'daybell-personal-sync') {
    throw new Error('Unexpected sync file format in Google Drive.');
  }
  return { fileId, payload };
}

export async function savePersonalSyncToDrive(
  accessToken: string,
  payload: PersonalSyncPayload,
): Promise<{ fileId: string; updatedAt: string }> {
  const existingId = await findPersonalSyncFileId(accessToken);
  const bodyJson = JSON.stringify(payload);

  if (existingId) {
    const res = await driveFetch(
      `${DRIVE_UPLOAD_API}/${encodeURIComponent(existingId)}?uploadType=media`,
      accessToken,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: bodyJson,
      },
    );
    if (!res.ok) {
      throw new Error(`Could not update personal sync in Google Drive (${res.status}).`);
    }
    return { fileId: existingId, updatedAt: payload.updatedAt };
  }

  const boundary = `daybell_boundary_${Date.now()}`;
  const metadata = {
    name: PERSONAL_SYNC_FILENAME,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  };
  const multipartBody =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${bodyJson}\r\n` +
    `--${boundary}--`;

  const res = await driveFetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id`, accessToken, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });
  if (!res.ok) {
    throw new Error(`Could not create personal sync in Google Drive (${res.status}).`);
  }
  const created = (await res.json()) as { id: string };
  return { fileId: created.id, updatedAt: payload.updatedAt };
}

export async function createSharedClassFileInDrive(
  accessToken: string,
  className: string,
  shareRole: 'writer' | 'reader',
  payload: SharedClassPayload,
): Promise<{ fileId: string; webViewLink?: string }> {
  const boundary = `daybell_class_${Date.now()}`;
  const safeName = className.trim() || 'Klasa';
  const metadata = {
    name: `DayBell Class - ${safeName}.json`,
    mimeType: 'application/json',
    description: 'DayBell shared class timetable, homework, and tests',
  };
  const multipartBody =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(payload)}\r\n` +
    `--${boundary}--`;

  const createRes = await driveFetch(
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,webViewLink`,
    accessToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    },
  );
  if (!createRes.ok) {
    throw new Error(`Could not create shared class file (${createRes.status}).`);
  }
  const created = (await createRes.json()) as { id: string; webViewLink?: string };

  // Enable anyone-with-link permission so classmates can join immediately via Class Code
  const permRes = await driveFetch(
    `${DRIVE_FILES_API}/${encodeURIComponent(created.id)}/permissions`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        type: 'anyone',
        role: shareRole,
      }),
    },
  );
  if (!permRes.ok) {
    throw new Error(`Shared file created, but link sharing failed (${permRes.status}).`);
  }

  return { fileId: created.id, webViewLink: created.webViewLink };
}

export async function pullSharedClassFromDrive(
  accessToken: string,
  rawFileIdOrUrl: string,
): Promise<{ fileId: string; payload: SharedClassPayload; canEdit: boolean; webViewLink?: string }> {
  const fileId = extractDriveFileId(rawFileIdOrUrl);
  if (!fileId) {
    throw new Error('Please enter a valid Class Code or Google Drive link.');
  }

  const metaRes = await driveFetch(
    `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?fields=id,name,webViewLink,capabilities(canEdit)`,
    accessToken,
  );
  if (metaRes.status === 404) {
    throw new Error('Class file not found. Double-check the Class Code or ask your classmate to share it.');
  }
  if (!metaRes.ok) {
    throw new Error(`Could not access shared class file (${metaRes.status}).`);
  }
  const meta = (await metaRes.json()) as {
    id: string;
    webViewLink?: string;
    capabilities?: { canEdit?: boolean };
  };

  const contentRes = await driveFetch(
    `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?alt=media`,
    accessToken,
  );
  if (!contentRes.ok) {
    throw new Error(`Could not download shared class plan (${contentRes.status}).`);
  }
  const payload = (await contentRes.json()) as SharedClassPayload;
  if (!payload || payload.kind !== 'daybell-shared-class') {
    throw new Error('This Google Drive file is not a DayBell shared class file.');
  }

  return {
    fileId: meta.id,
    payload,
    canEdit: Boolean(meta.capabilities?.canEdit),
    webViewLink: meta.webViewLink,
  };
}

export async function pushSharedClassToDrive(
  accessToken: string,
  fileId: string,
  payload: SharedClassPayload,
): Promise<{ updatedAt: string }> {
  const res = await driveFetch(
    `${DRIVE_UPLOAD_API}/${encodeURIComponent(fileId)}?uploadType=media`,
    accessToken,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(payload),
    },
  );
  if (res.status === 403) {
    throw new Error('This class file is view-only. Ask the class creator to enable editing.');
  }
  if (!res.ok) {
    throw new Error(`Could not update shared class file (${res.status}).`);
  }
  return { updatedAt: payload.updatedAt };
}
