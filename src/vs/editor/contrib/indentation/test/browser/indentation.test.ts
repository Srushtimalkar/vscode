/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { MetadataConsts } from 'vs/editor/common/encodedTokenAttributes';
import { EncodedTokenizationResult, IState, ITokenizationSupport, TokenizationRegistry } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { NullState } from 'vs/editor/common/languages/nullTokenize';
import { AutoIndentOnPaste, IndentationToSpacesCommand, IndentationToTabsCommand } from 'vs/editor/contrib/indentation/browser/indentation';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { testCommand } from 'vs/editor/test/browser/testCommand';
import { javascriptIndentationRules } from 'vs/editor/test/common/modes/supports/javascriptIndentationRules';
import { javascriptOnEnterRules } from 'vs/editor/test/common/modes/supports/javascriptOnEnterRules';

// optional: could move the workbench code to editor folder
// pull the two test files together
// for the failing tests add .skip
// Then start changing the regex
// Then only after change the code
// Find how to combine the tests later

enum Language {
	TypeScript,
	Ruby
}

function testIndentationToSpacesCommand(lines: string[], selection: Selection, tabSize: number, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new IndentationToSpacesCommand(sel, tabSize), expectedLines, expectedSelection);
}

function testIndentationToTabsCommand(lines: string[], selection: Selection, tabSize: number, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new IndentationToTabsCommand(sel, tabSize), expectedLines, expectedSelection);
}

function registerLanguage(instantiationService: TestInstantiationService, languageId: string, language: Language, disposables: DisposableStore) {
	const languageService = instantiationService.get(ILanguageService);
	registerLanguageConfiguration(instantiationService, languageId, language, disposables);
	disposables.add(languageService.registerLanguage({ id: languageId }));
}

// TODO@aiday-mar read directly the configuration file
function registerLanguageConfiguration(instantiationService: TestInstantiationService, languageId: string, language: Language, disposables: DisposableStore) {
	const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
	switch (language) {
		case Language.TypeScript:
			disposables.add(languageConfigurationService.register(languageId, {
				brackets: [
					['{', '}'],
					['[', ']'],
					['(', ')']
				],
				comments: {
					lineComment: '//',
					blockComment: ['/*', '*/']
				},
				indentationRules: javascriptIndentationRules,
				onEnterRules: javascriptOnEnterRules
			}));
			break;
		case Language.Ruby:
			disposables.add(languageConfigurationService.register(languageId, {
				brackets: [
					['{', '}'],
					['[', ']'],
					['(', ')']
				],
				indentationRules: {
					decreaseIndentPattern: /^\s*([}\]]([,)]?\s*(#|$)|\.[a-zA-Z_]\w*\b)|(end|rescue|ensure|else|elsif)\b|(in|when)\s)/,
					increaseIndentPattern: /^\s*((begin|class|(private|protected)\s+def|def|else|elsif|ensure|for|if|module|rescue|unless|until|when|in|while|case)|([^#]*\sdo\b)|([^#]*=\s*(case|if|unless)))\b([^#\{;]|(\"|'|\/).*\4)*(#.*)?$/,
				},
			}));
			break;
	}
}

function registerTokens(instantiationService: TestInstantiationService, tokens: { startIndex: number; value: number }[][], languageId: string, disposables: DisposableStore) {
	let lineIndex = 0;
	const languageService = instantiationService.get(ILanguageService);
	const tokenizationSupport: ITokenizationSupport = {
		getInitialState: () => NullState,
		tokenize: undefined!,
		tokenizeEncoded: (line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult => {
			const tokensOnLine = tokens[lineIndex++];
			const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
			const result = new Uint32Array(2 * tokensOnLine.length);
			for (let i = 0; i < tokensOnLine.length; i++) {
				result[2 * i] = tokensOnLine[i].startIndex;
				result[2 * i + 1] =
					(
						(encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
						| (tokensOnLine[i].value << MetadataConsts.TOKEN_TYPE_OFFSET)
					);
			}
			return new EncodedTokenizationResult(result, state);
		}
	};
	disposables.add(TokenizationRegistry.register(languageId, tokenizationSupport));
}

suite('Change Indentation to Spaces - TypeScript/Javascript', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('single tabs only at start of line', function () {
		testIndentationToSpacesCommand(
			[
				'first',
				'second line',
				'third line',
				'\tfourth line',
				'\tfifth'
			],
			new Selection(2, 3, 2, 3),
			4,
			[
				'first',
				'second line',
				'third line',
				'    fourth line',
				'    fifth'
			],
			new Selection(2, 3, 2, 3)
		);
	});

	test('multiple tabs at start of line', function () {
		testIndentationToSpacesCommand(
			[
				'\t\tfirst',
				'\tsecond line',
				'\t\t\t third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 5),
			3,
			[
				'      first',
				'   second line',
				'          third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 9, 1, 9)
		);
	});

	test('multiple tabs', function () {
		testIndentationToSpacesCommand(
			[
				'\t\tfirst\t',
				'\tsecond  \t line \t',
				'\t\t\t third line',
				' \tfourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 5),
			2,
			[
				'    first\t',
				'  second  \t line \t',
				'       third line',
				'   fourth line',
				'fifth'
			],
			new Selection(1, 7, 1, 7)
		);
	});

	test('empty lines', function () {
		testIndentationToSpacesCommand(
			[
				'\t\t\t',
				'\t',
				'\t\t'
			],
			new Selection(1, 4, 1, 4),
			2,
			[
				'      ',
				'  ',
				'    '
			],
			new Selection(1, 4, 1, 4)
		);
	});
});

suite('Change Indentation to Tabs -  TypeScript/Javascript', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('spaces only at start of line', function () {
		testIndentationToTabsCommand(
			[
				'    first',
				'second line',
				'    third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 3, 2, 3),
			4,
			[
				'\tfirst',
				'second line',
				'\tthird line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 3, 2, 3)
		);
	});

	test('multiple spaces at start of line', function () {
		testIndentationToTabsCommand(
			[
				'first',
				'   second line',
				'          third line',
				'fourth line',
				'     fifth'
			],
			new Selection(1, 5, 1, 5),
			3,
			[
				'first',
				'\tsecond line',
				'\t\t\t third line',
				'fourth line',
				'\t  fifth'
			],
			new Selection(1, 5, 1, 5)
		);
	});

	test('multiple spaces', function () {
		testIndentationToTabsCommand(
			[
				'      first   ',
				'  second     line \t',
				'       third line',
				'   fourth line',
				'fifth'
			],
			new Selection(1, 8, 1, 8),
			2,
			[
				'\t\t\tfirst   ',
				'\tsecond     line \t',
				'\t\t\t third line',
				'\t fourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 5)
		);
	});

	test('issue #45996', function () {
		testIndentationToSpacesCommand(
			[
				'\tabc',
			],
			new Selection(1, 3, 1, 3),
			4,
			[
				'    abc',
			],
			new Selection(1, 6, 1, 6)
		);
	});
});

suite('Full Auto Indent On Paste - TypeScript/JavaScript', () => {

	const languageId = 'ts-test';
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #119225: Do not add extra leading space when pasting JSDoc', () => {

		const model = createTextModel("", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			const pasteText = [
				'/**',
				' * JSDoc',
				' */',
				'function a() {}'
			].join('\n');
			const tokens = [
				[
					{ startIndex: 0, value: 1 },
					{ startIndex: 3, value: 1 },
				],
				[
					{ startIndex: 0, value: 1 },
					{ startIndex: 2, value: 1 },
					{ startIndex: 8, value: 1 },
				],
				[
					{ startIndex: 0, value: 1 },
					{ startIndex: 1, value: 1 },
					{ startIndex: 3, value: 0 },
				],
				[
					{ startIndex: 0, value: 0 },
					{ startIndex: 8, value: 0 },
					{ startIndex: 9, value: 0 },
					{ startIndex: 10, value: 0 },
					{ startIndex: 11, value: 0 },
					{ startIndex: 12, value: 0 },
					{ startIndex: 13, value: 0 },
					{ startIndex: 14, value: 0 },
					{ startIndex: 15, value: 0 },
				]
			];
			registerLanguage(instantiationService, languageId, Language.TypeScript, disposables);
			registerTokens(instantiationService, tokens, languageId, disposables);
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(pasteText, true, undefined, 'keyboard');
			autoIndentOnPasteController.trigger(new Range(1, 1, 4, 16));
			assert.strictEqual(model.getValue(), pasteText);
		});
	});

	test('issue #167299: Blank line removes indent', () => {

		const model = createTextModel("", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			const pasteText = [
				'',
				'export type IncludeReference =',
				'	| BaseReference',
				'	| SelfReference',
				'	| RelativeReference;',
				'',
				'export const enum IncludeReferenceKind {',
				'	Base,',
				'	Self,',
				'	RelativeReference,',
				'}'
			].join('\n');
			// no need for tokenization because there are no comments

			registerLanguage(instantiationService, languageId, Language.TypeScript, disposables);
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(pasteText, true, undefined, 'keyboard');
			autoIndentOnPasteController.trigger(new Range(1, 1, 11, 2));
			assert.strictEqual(model.getValue(), pasteText);
		});
	});

	// TODO@aiday-mar: failing test

	test.skip('issue #181065: Incorrect paste of object within comment', () => {

		const model = createTextModel("", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			const text = [
				'/**',
				' * @typedef {',
				' * }',
				' */'
			].join('\n');
			const tokens = [
				[
					{ startIndex: 0, value: 1 },
					{ startIndex: 3, value: 1 },
				],
				[
					{ startIndex: 0, value: 1 },
					{ startIndex: 2, value: 1 },
					{ startIndex: 3, value: 1 },
					{ startIndex: 11, value: 1 },
					{ startIndex: 12, value: 0 },
					{ startIndex: 13, value: 0 },
				],
				[
					{ startIndex: 0, value: 1 },
					{ startIndex: 2, value: 0 },
					{ startIndex: 3, value: 0 },
					{ startIndex: 4, value: 0 },
				],
				[
					{ startIndex: 0, value: 1 },
					{ startIndex: 1, value: 1 },
					{ startIndex: 3, value: 0 },
				]
			];
			registerLanguage(instantiationService, languageId, Language.TypeScript, disposables);
			registerTokens(instantiationService, tokens, languageId, disposables);
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(text, true, undefined, 'keyboard');
			autoIndentOnPasteController.trigger(new Range(1, 1, 4, 4));
			assert.strictEqual(model.getValue(), text);
		});
	});

	test('issue #86301: indent trailing new line', () => {

		const model = createTextModel([
			'() => {',
			'',
			'}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			editor.setSelection(new Selection(2, 1, 2, 1));
			const text = [
				'() => {',
				'',
				'}',
				''
			].join('\n');
			registerLanguage(instantiationService, languageId, Language.TypeScript, disposables);
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(text, true, undefined, 'keyboard');
			autoIndentOnPasteController.trigger(new Range(1, 1, 6, 2));
			assert.strictEqual(model.getValue(), [
				'() => {',
				'    () => {',
				'    ',
				'    }',
				'    ',
				'}',
			].join('\n'));
		});
	});

	test('issue #85781: indent correctly new line on which pasted', () => {

		const model = createTextModel([
			'() => {',
			'    console.log("a");',
			'}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			editor.setSelection(new Selection(2, 5, 2, 5));
			const text = [
				'() => {',
				'    console.log("b")',
				'}',
				' '
			].join('\n');
			registerLanguage(instantiationService, languageId, Language.TypeScript, disposables);
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(text, true, undefined, 'keyboard');
			// todo@aiday-mar, make sure range is correct, and make test work as in real life
			autoIndentOnPasteController.trigger(new Range(1, 1, 6, 2));
			assert.strictEqual(model.getValue(), [
				'() => {',
				'    () => {',
				'        console.log("b")',
				'    }',
				'    console.log("a");',
				'}',
			].join('\n'));
		});
	});
});

suite('Auto Indent On Type - TypeScript/JavaScript', () => {

	// test('issue #193875: incorrect indentation', () => {
	// 	const model = createTextModel([
	// 		'{',
	// 		'	for(;;)',
	// 		'	for(;;) {}',
	// 		'}'
	// 	].join('\n'), languageId, {});
	// 	disposables.add(model);
	// 	withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
	// 		instantiateContext(instantiationService);
	// 		// viewModel.type([
	// 		// 	'{',
	// 		// 	'	for(;;)',
	// 		// 	'	for(;;) {}',
	// 		// 	'}'
	// 		// ].join('\n'));
	// 		viewModel.setSelections('test', [new Selection(3, 11, 3, 11)]);
	// 		viewModel.type("\n", 'keyboard');
	// 		assert.strictEqual(model.getValue(), [
	// 			'{',
	// 			'	for(;;)',
	// 			'	for(;;) {',
	// 			'}',
	// 			'}'
	// 		].join('\n'));
	// 	});
	// });

	const languageId = "ts-test";
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// TODO@aiday-mar: failing test

	test.skip('issue #116843: dedent after arrow function', () => {

		const model = createTextModel("", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			registerLanguage(instantiationService, languageId, Language.TypeScript, disposables);

			viewModel.type([
				'const add1 = (n) =>',
				'	n + 1;',
			].join('\n'));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'const add1 = (n) =>',
				'	n + 1;',
				'',
			].join('\n'));
		});
	});

	test.skip('issue #40115: keep indentation where created', () => {

		const model = createTextModel('function foo() {}', languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			registerLanguage(instantiationService, languageId, Language.TypeScript, disposables);

			editor.setSelection(new Selection(1, 17, 1, 17));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'function foo() {',
				'    ',
				'}',
			].join('\n'));
			editor.setSelection(new Selection(2, 5, 2, 5));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'function foo() {',
				'    ',
				'    ',
				'}',
			].join('\n'));
		});
	});

	test('issue #40115: keep indentation where created', () => {
		// Add tests for:
		// https://github.com/microsoft/vscode/issues/88638
		// https://github.com/microsoft/vscode/issues/63388
		// https://github.com/microsoft/vscode/issues/46401
	});
});

suite('Auto Indent On Type - Ruby', () => {

	const languageId = "ruby-test";
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #198350: in or when incorrectly match non keywords for Ruby', () => {

		const model = createTextModel("", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			registerLanguage(instantiationService, languageId, Language.Ruby, disposables);

			// TODO@aiday-mar: requires registering the tokens ?

			viewModel.type("def foo\n        i");
			viewModel.type("n", 'keyboard');
			assert.strictEqual(model.getValue(), "def foo\n        in");
			viewModel.type(" ", 'keyboard');
			assert.strictEqual(model.getValue(), "def foo\nin ");

			viewModel.model.setValue("");
			viewModel.type("  # in");
			assert.strictEqual(model.getValue(), "  # in");
			viewModel.type(" ", 'keyboard');
			assert.strictEqual(model.getValue(), "  # in ");
		});
	});
});
