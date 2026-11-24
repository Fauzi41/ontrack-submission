import type {
  ActivePersona,
  FollowUpActionStatus,
  FollowUpRecord,
  IngestionRunSummary,
  PortfolioOverview,
  ProjectIntelligence,
  ProjectMasterRecord,
} from './types';

function actorHeaders(persona?: ActivePersona): Record<string, string> {
  if (!persona) return {};
  return {
    'X-Actor-Role': persona.role,
    'X-Actor-Name': persona.name,
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return body as T;
}

export function fetchPortfolio(asOf?: string, persona?: ActivePersona): Promise<PortfolioOverview> {
  const qs = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
  return requestJson<PortfolioOverview>(`/api/portfolio${qs}`, {
    headers: actorHeaders(persona),
  });
}

export function fetchProjectDetail(
  projectId: string,
  asOf?: string,
  persona?: ActivePersona
): Promise<ProjectIntelligence> {
  const qs = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
  return requestJson<ProjectIntelligence>(`/api/projects/${encodeURIComponent(projectId)}${qs}`, {
    headers: actorHeaders(persona),
  });
}

export function createFollowUp(
  payload: {
    project_id: string;
    title: string;
    description: string;
    owner: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    due_date: string | null;
    linked_signal_code: string | null;
    evidence_refs: string[];
    actor?: string;
  },
  persona?: ActivePersona
): Promise<FollowUpRecord> {
  return requestJson<FollowUpRecord>('/api/followups', {
    method: 'POST',
    headers: actorHeaders(persona),
    body: JSON.stringify(payload),
  });
}

export function updateFollowUp(
  id: string,
  payload: {
    action_status?: FollowUpActionStatus;
    owner?: string;
    due_date?: string | null;
    note?: string;
    actor?: string;
  },
  persona?: ActivePersona
): Promise<FollowUpRecord> {
  return requestJson<FollowUpRecord>(`/api/followups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: actorHeaders(persona),
    body: JSON.stringify(payload),
  });
}

export function verifyFollowUp(
  id: string,
  payload: { source_record_id: string; note: string; actor?: string },
  persona?: ActivePersona
): Promise<FollowUpRecord> {
  return requestJson<FollowUpRecord>(`/api/followups/${encodeURIComponent(id)}/verify`, {
    method: 'POST',
    headers: actorHeaders(persona),
    body: JSON.stringify(payload),
  });
}

export function triggerDiskRefresh(): Promise<IngestionRunSummary> {
  return requestJson<IngestionRunSummary>('/api/refresh', { method: 'POST' });
}

export function ingestPayloads(payload: {
  masterCsv?: string;
  updatesCsv?: string;
  prodJson?: string;
}): Promise<IngestionRunSummary> {
  return requestJson<IngestionRunSummary>('/api/ingest', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchIngestionRuns(): Promise<{ runs: IngestionRunSummary[] }> {
  return requestJson<{ runs: IngestionRunSummary[] }>('/api/ingestion/runs');
}

export function saveProjectMaster(
  payload: ProjectMasterRecord,
  asOf?: string,
  persona?: ActivePersona
): Promise<{ summary: IngestionRunSummary; project: ProjectIntelligence }> {
  const qs = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
  return requestJson(`/api/data/master${qs}`, {
    method: 'POST',
    headers: actorHeaders(persona),
    body: JSON.stringify(payload),
  });
}

export function appendOperationalSnapshot(
  payload: {
    source_record_id?: string;
    project_id: string;
    source_system: string;
    record_type: string;
    timestamp: string;
    metrics: Record<string, unknown>;
  },
  asOf?: string,
  persona?: ActivePersona
): Promise<{ source_record_id: string; summary: IngestionRunSummary; project: ProjectIntelligence | null }> {
  const qs = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
  return requestJson(`/api/data/production${qs}`, {
    method: 'POST',
    headers: actorHeaders(persona),
    body: JSON.stringify(payload),
  });
}

export function appendProjectUpdate(
  payload: {
    update_id?: string;
    project_id: string;
    timestamp: string;
    source_type: string;
    source_name: string;
    message: string;
  },
  asOf?: string,
  persona?: ActivePersona
): Promise<{ update_id: string; summary: IngestionRunSummary; project: ProjectIntelligence | null }> {
  const qs = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
  return requestJson(`/api/data/updates${qs}`, {
    method: 'POST',
    headers: actorHeaders(persona),
    body: JSON.stringify(payload),
  });
}

export function resetAllData(
  options: boolean | { resetFollowUps?: boolean; scope?: 'ALL' | 'OWN'; projectId?: string } = false,
  persona?: ActivePersona
): Promise<IngestionRunSummary> {
  const body =
    typeof options === 'boolean' ? { resetFollowUps: options } : options;
  return requestJson<IngestionRunSummary>('/api/data/reset', {
    method: 'POST',
    headers: actorHeaders(persona),
    body: JSON.stringify(body),
  });
}
