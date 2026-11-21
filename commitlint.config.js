export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'save',
        'catalog',
        'builds',
        'compare',
        'sell',
        'worker',
        'storage',
        'ui',
        'build',
        'ci',
        'deps',
        'release',
        'docs',
        'test',
      ],
    ],
  },
};
