module.exports = {
  root: true,
  env: {
    es2017: true,
    node: true
  },
  parserOptions: {
    ecmaVersion: 9,
  },
  extends: "eslint:recommended",
  rules: {
    "comma-dangle": ["error", "never"],
    "indent": [
      "error",
      2,
      {
        "SwitchCase": 1,
        "CallExpression": {
          "arguments": "off"
        },
        "ArrayExpression": 1
      }
    ],
    "array-bracket-spacing": [
      "error",
      "never"
    ],
    "object-curly-spacing": [
      "error",
      "always"
    ],
    "key-spacing": [
      "error",
      {
        beforeColon: false,
        afterColon: true,
        mode: "minimum"
      }
    ],
    "space-in-parens": [
      "error",
      "never"
    ],
    "no-empty": [
      "off"
    ],
    "quotes": [
      "error",
      "double",
      {
        avoidEscape: true
      }
    ],
    "semi": [
      "error",
      "always",
      {
        omitLastInOneLineBlock: false
      }
    ],
    "semi-spacing": [
      "error"
    ],
    "semi-style": [
      "error",
      "last"
    ],
    "no-unused-vars": [
      "warn"
    ],
    "no-useless-escape": [
      "warn"
    ],
    "no-multi-spaces": [
      "warn",
      {
        ignoreEOLComments: true
      }
    ],
    "comma-spacing": [
      "error",
      {
        before: false,
        after: true
      }
    ],
    "comma-style": [
      "error"
    ]
  }
};
