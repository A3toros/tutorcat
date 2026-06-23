import { Handler } from '@netlify/functions';
import { getHeaders } from './cors-headers';

/**
 * @deprecated Use superhero-image-job + poll superhero-image-result instead.
 * Kept so old clients get a clear error instead of a long timeout.
 */
const handler: Handler = async (event) => {
  const headers = getHeaders(event, true);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  return {
    statusCode: 410,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: false,
      error:
        'Portrait generation is async. Use superhero-image-job and poll superhero-image-result.',
    }),
  };
};

export { handler };
