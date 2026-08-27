function Event(): ClassDecorator {
  return () => undefined;
}

function Listener(_event: Function): ClassDecorator {
  return () => undefined;
}

@Event()
export class FakeNamedEvent {}

@Listener(FakeNamedEvent)
export class FakeNamedListener {
  handle(_event: FakeNamedEvent): void {}
}

