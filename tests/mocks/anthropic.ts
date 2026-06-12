import { HttpResponse, http, type HttpHandler } from 'msw';

const { json } = HttpResponse;

// Safety net for the Claude Haiku enrichment fallback. The LLM path is
// disabled in tests by leaving ANTHROPIC_API_KEY unset, so this handler only
// fires if an environment accidentally has the key set — it keeps tests
// hermetic instead of letting a real (billed) API call escape.
export const handlers: Array<HttpHandler> = [
  http.post('https://api.anthropic.com/v1/messages', () => {
    console.info('🔶 mocked Anthropic messages call');
    return json({
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-4-5',
      content: [
        {
          type: 'text',
          text: JSON.stringify({ title: null, price: null, currency: null }),
        },
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  }),
];
