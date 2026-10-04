import { generateId } from '../../lib/ids.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { writeAudit } from '../audit/audit.service.js';
import * as repo from './tags.repository.js';
import type { Request } from 'express';

/**
 * Tags business logic (engineering-contract.md §5, api-spec.md §9.6).
 *
 * All data access goes through the repository. The service enforces
 * the rules that span multiple operations: name uniqueness, cascade delete
 * of trade_tags on archive.
 */

export interface TagResource {
  id: string;
  name: string;
  color: string | null;
  category: 'setup' | 'mistake' | 'emotion' | 'market' | 'custom';
  tradeCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function toResource(row: any): any {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    category: row.category,
    tradeCount: row.tradeCount ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

/**
 * Lists the user's tags with optional filters.
 */
export async function listTags(
  userId: string,
  options: { category?: 'setup' | 'mistake' | 'emotion' | 'market' | 'custom'; q?: string; withCounts?: boolean; limit?: number; offset?: number; sort?: string; order?: 'asc' | 'desc' } = {}
) {
  const rows = await repo.listTags(userId, options);
  return rows.map(toResource);
}

/**
 * Gets a single tag by ID.
 */
export async function getTag(userId: string, id: string) {
  const row = await repo.findTagById(userId, id);
  if (!row) throw new NotFoundError('Tag not found');
  return toResource(row);
}

/**
 * Creates a new tag.
 */
export async function createTag(
  userId: string,
  input: { name: string; color: string | null; category: 'setup' | 'mistake' | 'emotion' | 'market' | 'custom' },
  req: any,
) {
  // Duplicate name check (case-insensitive)
  if (await repo.nameExists(userId, input.name)) {
    throw new ConflictError('A tag with that name already exists');
  }

  const row = await repo.insertTag(userId, input);

  await writeAudit({
    actorUserId: userId,
    action: 'tag.create',
    entityType: 'tag',
    entityId: row.id,
    req,
  });

  return toResource(row);
}

/**
 * Updates a tag (PATCH).
 */
export async function updateTag(
  userId: string,
  id: string,
  patch: Partial<{ name: string; color: string | null; category: 'setup' | 'mistake' | 'emotion' | 'market' | 'custom' }>,
  req: any,
) {
  const row = await repo.updateTag(userId, id, patch);

  await writeAudit({
    actorUserId: userId,
    action: 'tag.update',
    entityType: 'tag',
    entityId: id,
    req,
  });

  return toResource(row);
}

/**
 * Archives a tag (soft delete). Also deletes trade_tags rows.
 */
export async function archiveTag(userId: string, id: string, req: any): Promise<void> {
  await repo.deleteTag(userId, id);

  await writeAudit({
    actorUserId: userId,
    action: 'tag.archive',
    entityType: 'tag',
    entityId: id,
    req,
  });
}