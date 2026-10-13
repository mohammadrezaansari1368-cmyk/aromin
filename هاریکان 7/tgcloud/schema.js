import { table, integer, text, json } from 'sdk/db';

export const staff = table('staff', {
  userId: integer('user_id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  logoBusinessId: integer('logo_business_id'),
  logoFileId: text('logo_file_id'),
});
export const missions = table('missions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
});
export const reports = table('reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceKey: text('source_key').notNull().unique(),
  userId: integer('user_id').notNull(),
  missionId: integer('mission_id'),
  body: text('body'),
  voiceFileId: text('voice_file_id'),
  voiceDuration: integer('voice_duration'),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const businesses = table('businesses', {id:integer('id').primaryKey({autoIncrement:true}),ownerId:integer('owner_id').notNull(),name:text('name').notNull(),state:json('state').notNull(),version:integer('version').notNull().default(0)});
