import { Task } from "./fake-adapter.js";
@Task()
export class TaskExample { protected priority = 7; perform(_id: string): void {} }
