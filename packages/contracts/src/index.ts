/**
 * Shared TypeScript contracts for TradeOzeyid.
 * This package contains the exact types matching the API specification.
 */

// Health endpoint types
export interface HealthResponse {
  data: {
    status: 'ok' | 'error';
    version: string;
    database: 'ok' | 'error';
    uptimeSeconds: number;
  };
  meta: {
    requestId: string;
  };
}

// Standard API envelope types
export interface ApiResponse<T> {
  data: T;
  meta: {
    requestId: string;
    pagination?: PaginationMeta;
    filters?: Record<string, unknown>;
    notices?: string[];
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{
      path: string;
      message: string;
    }>;
  };
  meta: {
    requestId: string;
  };
}

export interface PaginationMeta {
  limit: number;
  nextCursor?: string;
  hasMore: boolean;
  totalCount: number | null;
}

// Error codes (matching api-spec.md §5)
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REUSE_DETECTED'
  | 'CSRF_FAILED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

// Enums matching database
export type UserStatus = 'active' | 'suspended' | 'deleted';
export type TokenRevokedReason = 'logout' | 'rotation' | 'reuse_detected' | 'password_change' | 'admin';
export type AccountType = 'live' | 'demo' | 'prop';
export type AccountStatus = 'active' | 'archived';
export type TradeDirection = 'long' | 'short';
export type TradeStatus = 'planned' | 'open' | 'closed' | 'cancelled';
export type MarketSession = 'sydney' | 'tokyo' | 'london' | 'new_york';
export type StrategyStatus = 'active' | 'archived';
export type ExecutionSide = 'entry' | 'entry_partial' | 'exit' | 'exit_partial';
export type AttachmentKind = 'screenshot' | 'chart' | 'document';
export type JournalScope = 'daily' | 'weekly' | 'monthly' | 'custom';
export type TagCategory = 'setup' | 'mistake' | 'emotion' | 'market' | 'custom';

// Resource types (matching api-spec.md §8)
export interface UserResource {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  baseCurrency: string;
  locale: string;
  status: UserStatus;
  emailVerifiedAt: string | null;
  defaultRiskPercent: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradingAccountResource {
  id: string;
  name: string;
  broker: string | null;
  type: AccountType;
  status: AccountStatus;
  currency: string;
  startingBalance: string;
  currentBalance: string;
  timezone: string | null;
  defaultRiskPercent: number;
  isDefault: boolean;
  notes: string | null;
  tradeCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TradeResource {
  id: string;
  accountId: string;
  account: {
    id: string;
    name: string;
    currency: string;
    type: AccountType;
  };
  strategyId: string | null;
  strategy: {
    id: string;
    name: string;
    color: string;
  } | null;
  symbol: string;
  direction: TradeDirection;
  status: TradeStatus;
  session: MarketSession;
  quantity: string;
  entryPrice: string;
  exitPrice: string | null;
  stopLoss: string;
  takeProfit: string | null;
  entryTime: string;
  exitTime: string | null;
  contractSize: string;
  plannedRisk: string;
  riskPercent: number | null;
  fees: string;
  swap: string;
  pnl: string | null;
  rMultiple: string | null;
  mae: string | null;
  mfe: string | null;
  title: string | null;
  mistake: string | null;
  followedPlan: boolean | null;
  brokeRules: boolean | null;
  tags: TagResource[];
  executions: TradeExecutionResource[];
  notes: TradeNoteResource[];
  attachments: TradeAttachmentResource[];
  review: TradeReviewResource | null;
  durationMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TradeExecutionResource {
  id: string;
  sequence: number;
  side: ExecutionSide;
  price: string;
  quantity: string;
  fee: string;
  executedAt: string;
  note: string | null;
  createdAt: string;
}

export interface TradeNoteResource {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TradeAttachmentResource {
  id: string;
  kind: AttachmentKind;
  storageKey: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  checksumSha256: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface TradeReviewResource {
  tradeId: string;
  confidenceBefore: number | null;
  fearBefore: number | null;
  fomoBefore: number | null;
  patienceBefore: number | null;
  followedPlan: boolean | null;
  brokeRules: boolean | null;
  revengeTrade: boolean | null;
  overtraded: boolean | null;
  enteredEarly: boolean | null;
  movedStop: boolean | null;
  rulesFollowed: number | null;
  rating: number | null;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyResource {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  status: StrategyStatus;
  color: string | null;
  rules: StrategyRuleResource[];
  tradeCount: number;
  stats: StrategyStatsResource | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StrategyRuleResource {
  id: string;
  position: number;
  text: string;
  isRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyStatsResource {
  // Populated from Phase 9 onward
  netPnl: string | null;
  winRate: number | null;
  profitFactor: string | null;
  averageR: string | null;
}

export interface TagResource {
  id: string;
  name: string;
  color: string | null;
  category: TagCategory;
  tradeCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface JournalEntryResource {
  id: string;
  accountId: string | null;
  entryDate: string;
  title: string | null;
  body: string;
  moodScore: number | null;
  wordCount: number;
  emotions: JournalEmotionResource[];
  tradeSummary: {
    tradeCount: number;
    netPnl: string;
    closedTrades: number;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface JournalEmotionResource {
  id: string;
  emotion: string;
  intensity: number;
  phase: 'before' | 'during' | 'after';
  note: string | null;
  createdAt: string;
}

export interface ReviewResource {
  id: string;
  scope: 'daily' | 'weekly' | 'monthly' | 'custom';
  periodStart: string;
  periodEnd: string;
  title: string | null;
  body: string;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Filter types (matching api-spec.md §6)
export interface TradeFilter {
  accountId?: string | string[];
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  symbol?: string | string[];
  direction?: TradeDirection | TradeDirection[];
  strategyId?: string | string[];
  tagId?: string | string[];
  session?: MarketSession | MarketSession[];
  status?: TradeStatus | TradeStatus[];
  minR?: string;
  maxR?: string;
  minPnl?: string;
  maxPnl?: string;
  emotionTagId?: string;
  brokeRules?: boolean;
  hasAttachments?: boolean;
  q?: string;
  timezone?: string;
}

// Request/Response types for key endpoints
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  version: string;
  database: 'ok' | 'error';
  uptimeSeconds: number;
}

export interface RiskCalculateRequest {
  accountId?: string;
  balance: string;
  riskPercent?: string;
  riskAmount?: string | null;
  direction: TradeDirection;
  entryPrice: string;
  stopLoss: string;
  takeProfit?: string;
  broker?: string;
  symbol?: string;
  contractSize?: string;
  lotStep?: string;
  minLot?: string;
  maxLot?: string;
  pipValue?: string | null;
}

export interface RiskCalculateResponse {
  slDistance: string;
  riskAmount: string;
  exactLot: string;
  recommendedLot: string;
  roundedLot: string;
  actualRisk: string;
  rrRatio: string;
  potentialProfit: string;
  riskPercentActual: string;
  warnings: string[];
}