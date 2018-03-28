const options = {
  timestamps: true
};

/**
 * Tags
 */
const fields = {
  id: { type: String, required: true  }, // lowercase label
  label: { type: String, required: true  }
};

export default function model (app, name) {
  const mongoose = app.get('mongoose');
  const schema = new mongoose.Schema(fields, options);
  return mongoose.model(name, schema);
}

model.schema = fields;