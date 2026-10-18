import { createHandle, createHandleError } from '#lib/server/http/create-handle.ts';
import { isMaintenanceExempt } from '#lib/server/http/maintenance.ts';
import { getServices } from '#lib/server/runtime/container.ts';

export const handle = createHandle({ getServices, isMaintenanceExempt });
export const handleError = createHandleError({ getServices });
