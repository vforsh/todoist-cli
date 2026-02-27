export type OutputMode = "human" | "plain" | "json";

export type GlobalOptions = {
  json?: boolean;
  plain?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  timeout?: string;
  retries?: string;
  endpoint?: string;
};

export type EffectiveConfig = {
  endpoint: string;
  apiToken?: string;
  timeout: number;
  retries: number;
};

export type StoredConfig = Partial<EffectiveConfig>;
