function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function repo() {
  return {
    owner: required('GITHUB_OWNER'),
    name: required('GITHUB_REPO'),
  };
}

function adminBaseUrl() {
  return required('ADMIN_BASE_URL').replace(/\/$/, '');
}

function allowedUser() {
  return required('ALLOWED_GITHUB_USER').toLowerCase();
}

module.exports = { required, repo, adminBaseUrl, allowedUser };
