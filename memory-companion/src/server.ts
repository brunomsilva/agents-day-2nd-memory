import { routeAgentRequest } from 'agents';
import { CompanionAgent } from './agents/companion';
import { CaregiverAgent } from './agents/caregiver';

export { CompanionAgent, CaregiverAgent };
// Alias for app.tsx compatibility until Task 11 updates the UI
export { CompanionAgent as ChatAgent };

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response('Not found', { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
