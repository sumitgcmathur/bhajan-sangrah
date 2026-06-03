const { getFile, listDir } = require('./github');
const { parseSectionsYaml } = require('./yaml-bridge');

async function listBhajanYamlPaths(token) {
  const secFile = await getFile('content/sections.yaml', token);
  if (!secFile) throw new Error('content/sections.yaml not found');
  const config = parseSectionsYaml(secFile.content);
  const paths = [];

  for (const section of config.sections || []) {
    const folder = section.folder || section.slug;
    const items = await listDir(`content/${folder}`, token);
    for (const item of items) {
      if (item.type === 'file' && /\.ya?ml$/i.test(item.name)) {
        paths.push(`content/${folder}/${item.name}`);
      }
    }
  }

  paths.sort((a, b) => a.localeCompare(b, 'en'));
  return { paths, config };
}

module.exports = { listBhajanYamlPaths };
