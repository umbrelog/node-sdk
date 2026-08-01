export enum PolicyAction {
  SEND = 'SEND',
  DROP = 'DROP',
  BUFFER_ONLY = 'BUFFER_ONLY',
}

export type PolicyRule = {
  level?: string;
  action: PolicyAction | string;
};

export type PolicySet = PolicyRule[];
