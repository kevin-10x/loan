const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

function load() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ applications: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getAll() {
  return load().applications;
}

function getById(id) {
  return load().applications.find(a => a.id === id);
}

function insert(application) {
  const data = load();
  data.applications.push(application);
  save(data);
  return application;
}

function update(id, patch) {
  const data = load();
  const idx = data.applications.findIndex(a => a.id === id);
  if (idx === -1) return null;
  data.applications[idx] = { ...data.applications[idx], ...patch };
  save(data);
  return data.applications[idx];
}

module.exports = { getAll, getById, insert, update };
