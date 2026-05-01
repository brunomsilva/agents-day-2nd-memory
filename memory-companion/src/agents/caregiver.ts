import { Agent } from "agents";

type CaregiverState = { linkedUserId?: string };

export class CaregiverAgent extends Agent<Env, CaregiverState> {
  initialState: CaregiverState = {};
}
