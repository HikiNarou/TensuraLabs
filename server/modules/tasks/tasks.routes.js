import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema } from '../../lib/schemas.js';
import { parseOrThrow } from '../../lib/validate.js';
import { taskBulkSchema, taskFilterSchema, taskInputSchema, taskUpdateSchema } from './tasks.schemas.js';

const summarySchema = z.object({ tzOffset: z.coerce.number().int().min(-840).max(840).default(0) });

/** Tasks & follow-ups for admins and editors (editors are limited to their own tasks). */
export function createTasksRouter({ tasksRepository, usersRepository, events, audit }) {
  const router = Router();

  const announce = (req, { task, previous, completedNow }) => {
    const meta = { actorId: req.user.id };
    if (completedNow) events.publish('task.completed', { task }, meta);
    if (task.assignedTo && task.assignedTo !== (previous?.assignedTo ?? null)) events.publish('task.assigned', { task }, meta);
  };

  router.get('/', (req, res) => res.json({ data: tasksRepository.list(parseOrThrow(taskFilterSchema, req.query), req.user) }));

  router.get('/summary', (req, res) => {
    res.json({ data: tasksRepository.summary(req.user, parseOrThrow(summarySchema, req.query)) });
  });

  router.get('/meta', (_req, res) => res.json({ data: { assignees: usersRepository.options() } }));

  router.post('/bulk', (req, res) => {
    const input = parseOrThrow(taskBulkSchema, req.body);
    const results = tasksRepository.bulk(input, req.user);
    for (const result of results) if (input.action !== 'delete') announce(req, result);
    audit(req, `bulk-${input.action}`, 'task', null, `Aksi massal "${input.action}" pada ${results.length} tugas`);
    res.json({ data: { affected: results.length } });
  });

  router.get('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    res.json({ data: tasksRepository.findFor(id, req.user) });
  });

  router.post('/', (req, res) => {
    const task = tasksRepository.create(parseOrThrow(taskInputSchema, req.body), req.user);
    events.publish('task.created', { task }, { actorId: req.user.id });
    announce(req, { task, previous: null, completedNow: false });
    audit(req, 'create', 'task', task.id, `Membuat tugas "${task.title}"`);
    res.status(201).json({ data: task });
  });

  router.patch('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const result = tasksRepository.update(id, parseOrThrow(taskUpdateSchema, req.body), req.user);
    announce(req, result);
    audit(req, result.completedNow ? 'complete' : 'update', 'task', id, `${result.completedNow ? 'Menyelesaikan' : 'Memperbarui'} tugas "${result.task.title}"`);
    res.json({ data: result.task });
  });

  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const task = tasksRepository.remove(id, req.user);
    audit(req, 'delete', 'task', id, `Menghapus tugas "${task.title}"`);
    res.status(204).end();
  });

  return router;
}
