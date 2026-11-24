import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { DEFAULT_AS_OF_DATE, OnTrackDatabase } from './db.js';
import { evaluateProjectIntelligence } from './intelligenceEngine.js';
import { isValidIsoDateTime } from './parsers.js';
import type { AttentionLevel, PortfolioOverview } from './types.js';

const ATTENTION_RANK: Record<AttentionLevel, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const createFollowUpSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().min(3).max(160),
  description: z.string().min(3).max(2000),
  owner: z.string().min(1).max(120),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD')
    .nullable()
    .optional(),
  linked_signal_code: z.string().max(120).nullable().optional(),
  evidence_refs: z.array(z.string()).optional(),
  actor: z.string().max(120).optional(),
  created_at: z.string().optional(),
});

const updateFollowUpSchema = z.object({
  action_status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED']).optional(),
  owner: z.string().min(1).max(120).optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD')
    .nullable()
    .optional(),
  title: z.string().min(3).max(160).optional(),
  description: z.string().min(3).max(2000).optional(),
  actor: z.string().max(120).optional(),
  note: z.string().max(1000).optional(),
  changed_at: z.string().optional(),
});

const verifyFollowUpSchema = z.object({
  source_record_id: z.string().min(1),
  note: z.string().min(3).max(1000),
  actor: z.string().max(120).optional(),
  verified_at: z.string().optional(),
});

const ingestSchema = z.object({
  masterCsv: z.string().optional(),
  updatesCsv: z.string().optional(),
  prodJson: z.string().optional(),
});

const masterUpsertSchema = z
  .object({
    project_id: z.string().min(2).max(40),
    customer: z.string().min(1).max(160),
    project_name: z.string().min(2).max(200),
    project_type: z.string().min(2).max(120),
    pic: z.string().min(1).max(120),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be YYYY-MM-DD'),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'deadline must be YYYY-MM-DD'),
    target: z.number().positive(),
    target_unit: z.string().min(1).max(40),
    reported_actual: z.number().min(0),
    reported_progress_pct: z.number().min(0).max(200),
    reported_status: z.string().min(1).max(40),
    last_reported_update_at: z.string().min(10),
  })
  .refine((d) => Date.parse(`${d.deadline}T00:00:00Z`) >= Date.parse(`${d.start_date}T00:00:00Z`), {
    message: 'deadline must be on or after start_date',
    path: ['deadline'],
  });

const appendUpdateSchema = z.object({
  update_id: z.string().min(2).max(60).optional(),
  project_id: z.string().min(1),
  timestamp: z.string().min(10),
  source_type: z.string().min(2).max(60),
  source_name: z.string().min(1).max(120),
  message: z.string().min(3).max(2000),
});

const appendProductionSchema = z.object({
  source_record_id: z.string().min(2).max(80).optional(),
  project_id: z.string().min(1),
  source_system: z.string().min(2).max(80),
  record_type: z.string().min(2).max(80),
  timestamp: z.string().min(10),
  metrics: z.record(z.string(), z.unknown()),
});

const resetDataSchema = z.object({
  resetFollowUps: z.boolean().optional(),
  scope: z.enum(['ALL', 'OWN']).optional(),
  projectId: z.string().min(1).optional(),
});

function resolveAsOf(raw: unknown): { asOf: string; error?: string } {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { asOf: DEFAULT_AS_OF_DATE };
  }
  const trimmed = raw.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T17:00:00` : trimmed;
  if (!isValidIsoDateTime(normalized)) {
    return {
      asOf: DEFAULT_AS_OF_DATE,
      error: `Invalid asOf timestamp "${trimmed}". Expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS.`,
    };
  }
  return { asOf: normalized };
}

interface RequestActor {
  role: 'DIRECTOR' | 'PIC';
  name: string;
}

function resolveRequestActor(req: express.Request): RequestActor {
  const rawRole = String(req.header('x-actor-role') ?? 'DIRECTOR').trim().toUpperCase();
  const rawName = String(req.header('x-actor-name') ?? '').trim();
  if (rawRole === 'PIC') {
    return { role: 'PIC', name: rawName };
  }
  return { role: 'DIRECTOR', name: rawName || 'Director (Management)' };
}

export interface CreateAppOptions {
  db: OnTrackDatabase;
  dataDir: string;
}

export function createApp({ db, dataDir }: CreateAppOptions) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    const runs = db.getIngestionRuns(1);
    const masters = db.getAllMasters();
    res.json({
      status: 'ok',
      default_as_of_date: DEFAULT_AS_OF_DATE,
      projects_loaded: masters.length,
      last_ingestion: runs[0] ?? null,
    });
  });

  app.get('/api/portfolio', (req, res) => {
    const { asOf, error } = resolveAsOf(req.query.asOf);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const actor = resolveRequestActor(req);
    const allMasters = db.getAllMasters();
    const availablePics = Array.from(new Set(allMasters.map((m) => m.pic))).sort();
    const masters =
      actor.role === 'PIC'
        ? allMasters.filter((m) => m.pic.toLowerCase() === actor.name.toLowerCase())
        : allMasters;

    const projects = masters
      .map((master) => {
        const updates = db.getUpdatesForProject(master.project_id);
        const prod = db.getProductionForProject(master.project_id);
        const followups = db.getFollowUps(master.project_id);
        return evaluateProjectIntelligence(master, updates, prod, followups, asOf);
      })
      .sort((a, b) => {
        const rankDiff = ATTENTION_RANK[b.attention_level] - ATTENTION_RANK[a.attention_level];
        if (rankDiff !== 0) return rankDiff;
        return b.attention_score - a.attention_score;
      });

    const overview: PortfolioOverview = {
      as_of_date: asOf,
      generated_at: new Date().toISOString(),
      available_pics: availablePics,
      kpis: {
        total_projects: projects.length,
        critical_attention: projects.filter((p) => p.attention_level === 'CRITICAL').length,
        high_attention: projects.filter((p) => p.attention_level === 'HIGH').length,
        medium_attention: projects.filter((p) => p.attention_level === 'MEDIUM').length,
        low_or_verified: projects.filter((p) => p.attention_level === 'LOW').length,
        projects_with_discrepancy: projects.filter((p) =>
          p.signals.some((s) =>
            [
              'REPORT_INCONSISTENCY',
              'SOURCE_DISCREPANCY',
              'WORKFLOW_STATE_GAP',
              'VALIDATION_GAP',
            ].includes(s.category)
          )
        ).length,
        projects_with_stale_data: projects.filter((p) =>
          p.signals.some((s) => s.category === 'DATA_STALENESS')
        ).length,
        projects_with_schedule_risk: projects.filter((p) =>
          p.signals.some((s) => s.category === 'SCHEDULE_FEASIBILITY')
        ).length,
        open_followups: projects.reduce((sum, p) => sum + p.open_followup_count, 0),
        resolved_awaiting_evidence: projects.reduce(
          (sum, p) => sum + p.resolved_unverified_followup_count,
          0
        ),
      },
      projects,
      last_ingestion: db.getIngestionRuns(1)[0] ?? null,
    };

    res.json(overview);
  });

  app.get('/api/projects/:projectId', (req, res) => {
    const { asOf, error } = resolveAsOf(req.query.asOf);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const master = db.getMasterById(req.params.projectId);
    if (!master) {
      res.status(404).json({ error: `Project "${req.params.projectId}" not found.` });
      return;
    }

    const actor = resolveRequestActor(req);
    if (actor.role === 'PIC' && master.pic.toLowerCase() !== actor.name.toLowerCase()) {
      res.status(403).json({
        error: `Access denied: PIC ${actor.name} cannot view ${master.project_id} (owned by PIC ${master.pic}).`,
      });
      return;
    }

    const updates = db.getUpdatesForProject(master.project_id);
    const prod = db.getProductionForProject(master.project_id);
    const followups = db.getFollowUps(master.project_id);
    const detail = evaluateProjectIntelligence(master, updates, prod, followups, asOf);

    res.json(detail);
  });

  app.get('/api/followups', (req, res) => {
    const projectId =
      typeof req.query.projectId === 'string' && req.query.projectId.trim()
        ? req.query.projectId.trim()
        : undefined;
    const actor = resolveRequestActor(req);

    if (actor.role === 'PIC') {
      const ownedIds = new Set(
        db
          .getAllMasters()
          .filter((m) => m.pic.toLowerCase() === actor.name.toLowerCase())
          .map((m) => m.project_id)
      );
      if (projectId && !ownedIds.has(projectId)) {
        res.status(403).json({
          error: `Access denied: PIC ${actor.name} cannot view follow-ups for ${projectId}.`,
        });
        return;
      }
      const list = db.getFollowUps(projectId).filter((f) => ownedIds.has(f.project_id));
      res.json({ followups: list });
      return;
    }

    res.json({ followups: db.getFollowUps(projectId) });
  });

  app.post('/api/followups', (req, res) => {
    const parsed = createFollowUpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const master = db.getMasterById(parsed.data.project_id);
    if (!master) {
      res.status(404).json({ error: `Project "${parsed.data.project_id}" not found.` });
      return;
    }

    const actor = resolveRequestActor(req);
    if (actor.role === 'PIC' && master.pic.toLowerCase() !== actor.name.toLowerCase()) {
      res.status(403).json({
        error: `Access denied: PIC ${actor.name} cannot create follow-ups on ${master.project_id} (owned by PIC ${master.pic}).`,
      });
      return;
    }

    const created = db.createFollowUp(parsed.data);
    res.status(201).json(created);
  });

  app.patch('/api/followups/:id', (req, res) => {
    const parsed = updateFollowUpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const existing = db.getFollowUpById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: `Follow-up "${req.params.id}" not found.` });
      return;
    }

    const actor = resolveRequestActor(req);
    if (actor.role === 'PIC') {
      const master = db.getMasterById(existing.project_id);
      if (!master || master.pic.toLowerCase() !== actor.name.toLowerCase()) {
        res.status(403).json({
          error: `Access denied: PIC ${actor.name} cannot modify follow-ups on ${existing.project_id}.`,
        });
        return;
      }
    }

    const updated = db.updateFollowUp(req.params.id, parsed.data);
    res.json(updated);
  });

  app.post('/api/followups/:id/verify', (req, res) => {
    const actor = resolveRequestActor(req);
    if (actor.role === 'PIC') {
      res.status(403).json({
        error:
          'Access denied (Separation of Duties): PIC cannot self-verify operational issue closure. Switch to Director / Management Reviewer.',
      });
      return;
    }

    const parsed = verifyFollowUpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = db.verifyFollowUpWithEvidence(req.params.id, parsed.data);
    if (result.error) {
      res.status(result.statusCode ?? 400).json({ error: result.error });
      return;
    }

    res.json(result.record);
  });

  app.post('/api/refresh', (req, res) => {
    const actor = resolveRequestActor(req);
    if (actor.role === 'PIC') {
      res.status(403).json({
        error: `Access denied: PIC ${actor.name} cannot trigger portfolio-wide disk refresh. Only Director may refresh all sources.`,
      });
      return;
    }
    const summary = db.ingestFromDirectory(dataDir, 'DISK_REFRESH');
    res.json(summary);
  });

  app.post('/api/ingest', (req, res) => {
    const actor = resolveRequestActor(req);
    if (actor.role === 'PIC') {
      res.status(403).json({
        error: `Access denied: PIC ${actor.name} cannot perform raw multi-project ingestion. Use your own project editor or switch to Director.`,
      });
      return;
    }
    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid ingest payload',
        details: parsed.error.flatten(),
      });
      return;
    }
    if (!parsed.data.masterCsv && !parsed.data.updatesCsv && !parsed.data.prodJson) {
      res.status(400).json({
        error: 'Provide at least one of masterCsv, updatesCsv, or prodJson.',
      });
      return;
    }

    const summary = db.ingestRawPayloads(parsed.data, 'API_INGEST');
    res.json(summary);
  });

  app.get('/api/ingestion/runs', (req, res) => {
    const actor = resolveRequestActor(req);
    if (actor.role === 'PIC') {
      res.status(403).json({
        error: `Access denied: PIC ${actor.name} cannot view portfolio-wide ingestion audit logs.`,
      });
      return;
    }
    res.json({ runs: db.getIngestionRuns(20) });
  });

  // =========================================================================
  // STRUCTURED DATA MANAGEMENT DASHBOARD ENDPOINTS (Live Edit + Auto Recalc)
  // Enforces persona ownership & separation of duties via X-Actor-Role/Name
  // =========================================================================
  app.post('/api/data/master', (req, res) => {
    const parsed = masterUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const actor = resolveRequestActor(req);
    const existingMaster = db.getMasterById(parsed.data.project_id);
    if (actor.role === 'PIC') {
      if (!actor.name) {
        res.status(403).json({ error: 'Access denied: PIC identity (X-Actor-Name) is required.' });
        return;
      }
      if (!existingMaster) {
        res.status(403).json({
          error: `Access denied: PIC ${actor.name} cannot create new projects. Only Director can add projects.`,
        });
        return;
      }
      if (existingMaster.pic.toLowerCase() !== actor.name.toLowerCase()) {
        res.status(403).json({
          error: `Access denied: PIC ${actor.name} cannot modify ${existingMaster.project_id} (owned by PIC ${existingMaster.pic}).`,
        });
        return;
      }
      if (parsed.data.pic.trim().toLowerCase() !== actor.name.toLowerCase()) {
        res.status(403).json({
          error: `Access denied: PIC ${actor.name} cannot reassign project PIC ownership.`,
        });
        return;
      }
    }

    const normalizedTs = /^\d{4}-\d{2}-\d{2}$/.test(parsed.data.last_reported_update_at)
      ? `${parsed.data.last_reported_update_at}T17:00:00`
      : parsed.data.last_reported_update_at;
    if (!isValidIsoDateTime(normalizedTs)) {
      res.status(400).json({ error: 'Invalid last_reported_update_at timestamp.' });
      return;
    }

    const summary = db.upsertMasterDirect({
      ...parsed.data,
      last_reported_update_at: normalizedTs,
    });
    const { asOf } = resolveAsOf(req.query.asOf);
    const updatedMaster = db.getMasterById(parsed.data.project_id)!;
    const intelligence = evaluateProjectIntelligence(
      updatedMaster,
      db.getUpdatesForProject(updatedMaster.project_id),
      db.getProductionForProject(updatedMaster.project_id),
      db.getFollowUps(updatedMaster.project_id),
      asOf
    );

    res.json({ summary, project: intelligence });
  });

  app.post('/api/data/updates', (req, res) => {
    const parsed = appendUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const actor = resolveRequestActor(req);
    const targetMaster = db.getMasterById(parsed.data.project_id);
    if (actor.role === 'PIC') {
      if (!targetMaster) {
        res.status(404).json({ error: `Project "${parsed.data.project_id}" not found.` });
        return;
      }
      if (targetMaster.pic.toLowerCase() !== actor.name.toLowerCase()) {
        res.status(403).json({
          error: `Access denied: PIC ${actor.name} cannot post updates for ${targetMaster.project_id} (owned by PIC ${targetMaster.pic}).`,
        });
        return;
      }
    }

    if (!isValidIsoDateTime(parsed.data.timestamp)) {
      res.status(400).json({ error: 'Invalid update timestamp.' });
      return;
    }

    const updateId =
      parsed.data.update_id?.trim() ||
      `UPD-UI-${Date.now().toString().slice(-6)}`;
    const csvEscape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const updatesCsv = [
      'update_id,project_id,timestamp,source_type,source_name,message',
      [
        updateId,
        parsed.data.project_id,
        parsed.data.timestamp,
        parsed.data.source_type.toUpperCase(),
        parsed.data.source_name,
        parsed.data.message,
      ]
        .map(csvEscape)
        .join(','),
    ].join('\n');

    const summary = db.ingestRawPayloads({ updatesCsv }, 'API_INGEST');
    if (summary.updates_conflict_flagged > 0 || summary.quarantined_count > 0) {
      res.status(409).json({
        error: summary.warnings[0]?.message || 'Update rejected due to conflict or invalid data.',
        summary,
      });
      return;
    }

    const { asOf } = resolveAsOf(req.query.asOf);
    const master = db.getMasterById(parsed.data.project_id);
    const project = master
      ? evaluateProjectIntelligence(
          master,
          db.getUpdatesForProject(master.project_id),
          db.getProductionForProject(master.project_id),
          db.getFollowUps(master.project_id),
          asOf
        )
      : null;

    res.status(201).json({ update_id: updateId, summary, project });
  });

  app.post('/api/data/production', (req, res) => {
    const actor = resolveRequestActor(req);
    if (actor.role === 'PIC') {
      res.status(403).json({
        error: `Access denied (Separation of Duties): PIC ${actor.name} cannot add or alter Operational System Evidence. Only Director or automated system ingestion may write operational snapshots.`,
      });
      return;
    }

    const parsed = appendProductionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    if (!isValidIsoDateTime(parsed.data.timestamp)) {
      res.status(400).json({ error: 'Invalid production timestamp.' });
      return;
    }

    const recordId =
      parsed.data.source_record_id?.trim() ||
      `PROD-UI-${Date.now().toString().slice(-6)}`;

    const recordPayload = {
      source_record_id: recordId,
      project_id: parsed.data.project_id,
      source_system: parsed.data.source_system,
      record_type: parsed.data.record_type,
      timestamp: parsed.data.timestamp,
      ...parsed.data.metrics,
    };

    const summary = db.ingestRawPayloads(
      { prodJson: JSON.stringify({ records: [recordPayload] }) },
      'API_INGEST'
    );

    if (summary.production_conflict_flagged > 0 || summary.quarantined_count > 0) {
      res.status(409).json({
        error: summary.warnings[0]?.message || 'Production record rejected due to conflict or validation error.',
        summary,
      });
      return;
    }

    const { asOf } = resolveAsOf(req.query.asOf);
    const master = db.getMasterById(parsed.data.project_id);
    const project = master
      ? evaluateProjectIntelligence(
          master,
          db.getUpdatesForProject(master.project_id),
          db.getProductionForProject(master.project_id),
          db.getFollowUps(master.project_id),
          asOf
        )
      : null;

    res.status(201).json({ source_record_id: recordId, summary, project });
  });

  app.post('/api/data/reset', (req, res) => {
    const actor = resolveRequestActor(req);
    const parsed = resetDataSchema.safeParse(req.body ?? {});
    const resetFollowUps = parsed.success ? Boolean(parsed.data.resetFollowUps) : false;
    const scope = parsed.success ? parsed.data.scope ?? 'ALL' : 'ALL';
    const requestedProjectId = parsed.success ? parsed.data.projectId : undefined;

    if (actor.role === 'PIC') {
      const ownedIds = db
        .getAllMasters()
        .filter((m) => m.pic.toLowerCase() === actor.name.toLowerCase())
        .map((m) => m.project_id);

      if (requestedProjectId) {
        if (!ownedIds.includes(requestedProjectId)) {
          res.status(403).json({
            error: `Access denied: PIC ${actor.name} cannot reset ${requestedProjectId} (not owned by ${actor.name}).`,
          });
          return;
        }
        const summary = db.resetProjectsToAuthoritativeData(
          dataDir,
          [requestedProjectId],
          resetFollowUps
        );
        res.json(summary);
        return;
      }

      if (scope === 'OWN') {
        const summary = db.resetProjectsToAuthoritativeData(dataDir, ownedIds, resetFollowUps);
        res.json(summary);
        return;
      }

      res.status(403).json({
        error: `Access denied: PIC ${actor.name} cannot reset the entire portfolio dataset. Use scope="OWN" to reset only your own project(s), or switch to Director.`,
      });
      return;
    }

    if (requestedProjectId) {
      const summary = db.resetProjectsToAuthoritativeData(
        dataDir,
        [requestedProjectId],
        resetFollowUps
      );
      res.json(summary);
      return;
    }

    const summary = db.resetToAuthoritativeData(dataDir, resetFollowUps);
    res.json(summary);
  });

  return app;
}
