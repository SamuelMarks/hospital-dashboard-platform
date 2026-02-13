var ROUTES_INDEX = {
  name: '<root>',
  kind: 'module',
  children: [
    { name: 'login', kind: 'route-path', filename: 'src/app/app.routes.ts' },
    { name: 'register', kind: 'route-path', filename: 'src/app/app.routes.ts' },
    { name: 'dashboard/:id', kind: 'route-path', filename: 'src/app/app.routes.ts' },
    { name: 'chat', kind: 'route-path', filename: 'src/app/app.routes.ts' },
    { name: 'analytics', kind: 'route-path', filename: 'src/app/app.routes.ts' },
    { name: 'simulation', kind: 'route-path', filename: 'src/app/app.routes.ts' },
    { name: '**', kind: 'route-path', filename: 'src/app/app.routes.ts' },
  ],
};
