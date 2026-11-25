import { z } from 'zod';

export type CopilotActionType =
  | 'ADD_TO_CART'
  | 'NAVIGATE'
  | 'OPEN_QUOTE'
  | 'SEARCH_PRODUCT'
  | 'SHOW_CUSTOMER'
  | 'NONE';

export interface CopilotClientAction {
  type: CopilotActionType;
  title: string;
  summary: string;
  payload: any;
}

export const copilotChatMessageSchema = z.object({
  role: z.enum(['user', 'model', 'system']),
  content: z.string().trim().min(1),
});
export type CopilotChatMessage = z.infer<typeof copilotChatMessageSchema>;

export const copilotChatRequestSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    if (typeof val.message === 'string' && (!val.messages || !Array.isArray(val.messages))) {
      return {
        ...val,
        messages: [{ role: 'user', content: val.message }],
      };
    }
  }
  return val;
}, z.object({
  messages: z.array(copilotChatMessageSchema).min(1, 'Debe incluir al menos un mensaje'),
  currentRoute: z.string().optional(),
  cartItemCount: z.number().int().min(0).optional(),
}));
export type CopilotChatRequest = z.infer<typeof copilotChatRequestSchema>;

export interface CopilotChatResponse {
  reply: string;
  actions: CopilotClientAction[];
  suggestedChips: string[];
}
