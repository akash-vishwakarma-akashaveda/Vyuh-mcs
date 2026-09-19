import { z } from 'zod';

export const ExecuteCommandSchema = z.object({
  satellite_id: z.string().min(1, 'Satellite required'),
  procedure_id: z.string().min(1, 'Procedure required'),
  procedure_version: z.string().default('1.0'),
  params: z.record(z.unknown()),
  execution_mode: z.enum(['CONTINUOUS', 'STEP_BY_STEP', 'BREAKPOINT']),
});

export const SandboxCommandSchema = z.object({
  satellite_id: z.string().min(1, 'Target satellite required'),
  command_mnemonic: z.string().min(1, 'Command mnemonic required'),
  params: z.record(z.unknown()),
  preview_only: z.boolean().default(true),
});

export type ExecuteCommandInput = z.infer<typeof ExecuteCommandSchema>;
export type SandboxCommandInput = z.infer<typeof SandboxCommandSchema>;
