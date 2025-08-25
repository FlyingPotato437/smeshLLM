import { handleFireDetectionWebhook } from '@/lib/services/data-ingestion';

export async function POST(request: Request) {
  return handleFireDetectionWebhook(request);
} 