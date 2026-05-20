export const MENU = 'MENU';
export const DRIVE = 'DRIVE';

export class StateMachine {
  constructor(onChange = () => {}) {
    this.state = MENU;
    this.onChange = onChange;
  }
  start() {
    if (this.state === DRIVE) return;
    const prev = this.state;
    this.state = DRIVE;
    this.onChange(prev, DRIVE);
  }
}
