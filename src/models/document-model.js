import timestamps from 'mongoose-timestamp';
import { plugins } from 'mostly-feathers-mongoose';

const options = {
  discriminatorKey: 'type'
};

const fields = {
  title: { type: 'String', required: true },
  description: { type: 'String' },
  subjects: [{ type: 'String' }],
  rights: [{ type: 'String' }],
  source: { type: 'String' },
  nature: { type: 'String' },
  coverage: { type: 'String' },
  issued: { type: 'Date' },
  valid: { type: 'Date' },
  expired: { type: 'Date' },
  format: { type: 'String' },
  language: { type: 'String' },
  creator: { type: 'String' },
  contributors: [{ type: 'String' }],
  verion: { type: 'String' }
};

export default function(app, name) {
  const mongoose = app.get('mongoose');
  const schema = new mongoose.Schema(fields, options);
  schema.plugin(timestamps);
  schema.plugin(plugins.softDelete);
  return mongoose.model(name, schema);
}