import { Project } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
});

const sourceFiles = project
  .getSourceFiles('src/**/*.ts')
  .filter((f) => !f.getFilePath().includes('.spec.ts') && !f.getFilePath().includes('api-client'));

for (const sf of sourceFiles) {
  for (const cls of sf.getClasses()) {
    if (!cls.getJsDocs().length) cls.addJsDoc('doc');
    for (const prop of cls.getProperties()) {
      if (!prop.getJsDocs().length) prop.addJsDoc('doc');
    }
    for (const method of cls.getMethods()) {
      if (!method.getJsDocs().length) method.addJsDoc('doc');
    }
    for (const ctor of cls.getConstructors()) {
      if (!ctor.getJsDocs().length) ctor.addJsDoc('doc');
    }
    for (const get of cls.getGetAccessors()) {
      if (!get.getJsDocs().length) get.addJsDoc('doc');
    }
  }
  for (const intf of sf.getInterfaces()) {
    if (!intf.getJsDocs().length) intf.addJsDoc('doc');
    for (const prop of intf.getProperties()) {
      if (!prop.getJsDocs().length) prop.addJsDoc('doc');
    }
  }
  for (const type of sf.getTypeAliases()) {
    if (!type.getJsDocs().length) type.addJsDoc('doc');
  }
  for (const fn of sf.getFunctions()) {
    if (!fn.getJsDocs().length) fn.addJsDoc('doc');
  }
  for (const v of sf.getVariableStatements()) {
    if (!v.getJsDocs().length && v.isExported()) v.addJsDoc('doc');
  }
  sf.saveSync();
}
