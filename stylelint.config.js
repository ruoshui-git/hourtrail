/**
 * Blaze conformance (docs/DESIGN_SYSTEM.md, "Keeping the build on the design system"):
 * outside tokens.css, styles use --ht-* tokens only. No raw colours, no lengths or
 * durations in px/rem/em/ch/ms/s, and fonts, radii, shadows and layers come from tokens.
 *
 * @type {import('stylelint').Config}
 */
const tokenOnly = (prefixes, extra = []) => [
	...prefixes.map((p) => new RegExp(`^var\\(--ht-${p}[\\w-]*\\)$`)),
	...extra,
];

export default {
	extends: ['stylelint-config-standard', 'stylelint-config-html/svelte'],
	rules: {
		'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global'] }],
		'color-no-hex': true,
		'color-named': 'never',
		'function-disallowed-list': [
			'rgb',
			'rgba',
			'hsl',
			'hsla',
			'hwb',
			'lab',
			'lch',
			'oklab',
			'oklch',
		],
		'unit-disallowed-list': [
			['px', 'rem', 'em', 'ch', 'pt', 'ms', 's'],
			{ ignoreMediaFeatureNames: { px: ['width', 'min-width', 'max-width'] } },
		],
		'declaration-property-value-allowed-list': [
			{
				font: tokenOnly(['type-'], ['inherit']),
				'font-family': tokenOnly(['font-'], ['inherit']),
				'font-size': tokenOnly(['size-'], ['inherit']),
				'font-weight': tokenOnly(['weight-'], ['inherit']),
				'/^border(-\\w+)*-radius$/': tokenOnly(['radius-'], ['0', 'inherit']),
				'box-shadow': tokenOnly(['shadow-'], ['none']),
				'z-index': tokenOnly(['z-'], ['0', 'auto']),
			},
			{ severity: 'error' },
		],
	},
	overrides: [
		{
			// The token file and the base reset may hold raw values.
			files: ['apps/web/src/lib/styles/tokens.css', 'apps/web/src/lib/styles/base.css'],
			rules: {
				'color-no-hex': null,
				'color-named': null,
				'function-disallowed-list': null,
				'unit-disallowed-list': null,
				'declaration-property-value-allowed-list': null,
				'property-no-vendor-prefix': null,
				'declaration-no-important': null,
			},
		},
	],
};
