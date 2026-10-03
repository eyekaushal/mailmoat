import { Router } from 'express';
import { ChatDecideSchema, ChatSendSchema, IdParamSchema } from '@mailmoat/shared/schemas/api';
import { NotFoundError } from '../../core/errors.js';
import { validate } from '../validate.js';

/**
 * AI Chat (PRD F8, §13). `POST /chat` answers with Server-Sent Events: one `chat` event per
 * step/result/card as the Interpreter runs, then a final `done` event with the stored turn.
 * Card buttons go to `POST /chats/:id/decide`, which records the outcome in the chat.
 */
export class ChatRoutes {
  #deps;

  /** @param {{ chats: import('../../features/ChatService.js').ChatService }} deps */
  constructor(deps) {
    this.#deps = deps;
  }

  router() {
    const { chats } = this.#deps;
    const router = Router();

    router.get('/chats', (_request, response) => response.json(chats.list()));
    router.post('/chats', (_request, response) => response.status(201).json(chats.create()));
    router.get('/chats/:id', (request, response) => {
      const { id } = validate(IdParamSchema, request.params);
      const chat = chats.list().find((entry) => entry.id === id);
      if (!chat) throw new NotFoundError('Unknown chat');
      response.json({ ...chat, messages: chats.messages(id) });
    });
    router.delete('/chats/:id', (request, response) => {
      const { id } = validate(IdParamSchema, request.params);
      if (!chats.delete(id)) throw new NotFoundError('Unknown chat');
      response.status(204).end();
    });
    router.post('/chats/:id/decide', async (request, response) => {
      const { id } = validate(IdParamSchema, request.params);
      const { approvalId, action } = validate(ChatDecideSchema, request.body);
      response.json(await chats.decide({ chatId: id, approvalId, action }));
    });

    router.post('/chat', async (request, response) => {
      const { chatId: given, message, emailId } = validate(ChatSendSchema, request.body);
      const chatId = given ?? chats.create().id;
      response.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      response.flushHeaders();
      const emit = (event, data) =>
        response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      emit('chat', { type: 'chat', chatId });
      try {
        const content = await chats.send({
          chatId,
          message,
          emailId: emailId ?? null,
          onEvent: (event) => emit('chat', event),
        });
        emit('done', { chatId, content });
      } catch (error) {
        // Headers are out, so the error travels in the stream instead of a status code.
        emit('error', { message: error.message });
      }
      response.end();
    });
    return router;
  }
}
