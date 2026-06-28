export type Awaitable<T> = Promise<T> | T;

export interface AlintConfig {
  plugins?: PluginDefinition[];
  rules?: Record<string, RuleConfigEntry>;
}

export interface DiagnosticDescriptor {
  evidence?: unknown;
  filePath?: string;
  loc?: DiagnosticLocation;
  message: string;
}

export interface DiagnosticLocation {
  end?: SourcePosition;
  start: SourcePosition;
}

export interface InferenceUsageRecord {
  inputTokens?: number;
  modelId: string;
  outputTokens?: number;
  providerId: string;
  totalTokens?: number;
}

export interface PluginDefinition {
  rules: Record<string, RuleDefinition>;
  scope: string;
}

export type RuleConfigEntry = [RuleSeverity] | RuleSeverity;

export interface RuleContext {
  metering?: {
    recordUsage: (usage: InferenceUsageRecord) => void;
  };
  model: () => Promise<ResolvedModel>;
  report: (diagnostic: DiagnosticDescriptor) => void;
}

export interface RuleDefinition {
  cache?: boolean | { level?: "target" };
  create: (context: RuleContext) => RuleHandlers;
  model?: ModelRequirement;
}

export interface RuleHandlers {
  onFile?: (file: SourceFile) => Awaitable<void>;
}

export type RuleSeverity = "error" | "off" | "warn";

export interface SourceFile {
  language: "javascript" | "typescript" | "unknown";
  lines: string[];
  path: string;
  text: string;
}

export interface SourcePosition {
  column: number;
  line: number;
}

export interface ResolvedModel {
  id: string;
  provider: {
    endpoint: string;
    headers?: Record<string, string>;
    id: string;
  };
}

export interface ModelRequirement {
  capabilities?: string[];
  minContextWindow?: number;
  params?: Record<string, unknown>;
  size?: string;
}
