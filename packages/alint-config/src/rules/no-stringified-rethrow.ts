import type { GenerateTextResult } from "xsai";
import { generateText } from "xsai";
import type { ResolvedModel, RuleContext, RuleDefinition, SourceFile } from "../types";

export interface ErrorWrappingReviewFinding {
  evidence?: unknown;
  line: number;
  message?: string;
}

interface ReviewResponse {
  findings?: ErrorWrappingReviewFinding[];
}

export const noStringifiedRethrowRule: RuleDefinition = {
  create: (ctx) => ({
    async onFile(file) {
      const model = await ctx.model();
      const findings = await reviewStringifiedRethrows(file, model, ctx.metering);

      for (const finding of findings) {
        ctx.report({
          evidence: finding.evidence,
          filePath: file.path,
          loc: {
            start: {
              column: 0,
              line: finding.line,
            },
          },
          message:
            finding.message ??
            "Do not stringify and rethrow caught errors; preserve the original error as cause.",
        });
      }
    },
  }),
};

async function reviewStringifiedRethrows(
  file: SourceFile,
  model: ResolvedModel,
  usage: RuleContext["metering"],
): Promise<ErrorWrappingReviewFinding[]> {
  const response = await generateText({
    baseURL: model.provider.endpoint,
    headers: model.provider.headers,
    messages: createReviewMessages(file),
    model: model.id,
    response_format: {
      type: "json_object",
    },
    temperature: 0,
  });
  const content = response.text;

  if (typeof content !== "string") {
    throw new Error("alint model response did not include message content.");
  }

  recordUsage(usage, model, response);

  const result = JSON.parse(content) as ReviewResponse;

  if (!Array.isArray(result.findings)) {
    return [];
  }

  return result.findings.filter(isReviewFinding);
}

function createReviewMessages(
  file: SourceFile,
): Array<{ content: string; role: "system" | "user" }> {
  return [
    {
      content: [
        "You are reviewing one JavaScript or TypeScript file.",
        "",
        "Task:",
        "Find catch blocks that stringify, format, or otherwise collapse the caught error into a message string before throwing a new error, without preserving the original error as the error cause.",
        "",
        "Report only cases where the original caught error is not preserved through `cause` or an equivalent custom error cause field.",
        "Do not report code that throws `new Error(message, { cause: error })`.",
        "Do not report custom error classes that pass or store the caught error as cause.",
        "Do not report code that logs an error and rethrows the same original error.",
        "",
        "Return JSON only with this shape:",
        '{"findings":[{"line":1,"message":"short diagnostic","evidence":{"reason":"short reason"}}]}',
        "Use the line number of the throw statement.",
        "Return an empty findings array when there is no issue.",
      ].join("\n"),
      role: "system",
    },
    {
      content: `File: ${file.path}\n\n${formatSourceWithLineNumbers(file.text)}`,
      role: "user",
    },
  ];
}

function formatSourceWithLineNumbers(source: string): string {
  return source
    .split("\n")
    .map((line, index) => `${index + 1} | ${line}`)
    .join("\n");
}

function isReviewFinding(value: unknown): value is ErrorWrappingReviewFinding {
  if (!value || typeof value !== "object") {
    return false;
  }

  const finding = value as Partial<ErrorWrappingReviewFinding>;

  return typeof finding.line === "number" && Number.isInteger(finding.line) && finding.line > 0;
}

function recordUsage(
  metering: RuleContext["metering"],
  model: ResolvedModel,
  response: GenerateTextResult,
): void {
  if (!metering) {
    return;
  }

  metering.recordUsage({
    inputTokens: response.usage.inputTokens,
    modelId: model.id,
    outputTokens: response.usage.outputTokens,
    providerId: model.provider.id,
    totalTokens: response.usage.totalTokens,
  });
}
