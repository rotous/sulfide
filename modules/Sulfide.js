const puppeteer = require('puppeteer');

require('./String');

const SulfideElement = require('./SulfideElement')(Sulfide);
const SulfideElementCollection = require('./SulfideElementCollection')(Sulfide, SulfideElement);
const Conditions = require('./Conditions')(Sulfide, SulfideElement, SulfideElementCollection);
const Selectors = require('./Selectors')(Sulfide, SulfideElement);

/**
 * Contains a reference to the opened browser
 * @type {Object}
 */
let browser;

/**
 * The url that will be used when launching the browser
 * Note: This variable will not be updated when opening another page.
 */
let launchUrl = '';

/**
 * Main function of Sulfide. Acts as an SulfideElement creator.
 * @param {String|SulfideElement} selector CSS selector or xpath, used to create the SulfideElement, or a SulfideElement
 * @return {SulfideElement} the SulfideElement based on the passed selector or xpath
 */
function Sulfide(selector) {
	if ( selector instanceof SulfideElement ) {
		return selector;
	}

	return new SulfideElement(selector);
}

function $$(selector) {
	if ( selector instanceof SulfideElement ) {
		const collection = new SulfideElementCollection();
		collection.selectors = [].concat(selector.selectors);
		return collection;
	}

	return new SulfideElementCollection(selector);
}

/* eslint-disable no-magic-numbers */
// Default configuration
const _DEFAULT_CONFIG_ = { // eslint-disable-line no-underscore-dangle
	noGlobals: false,
	headless: true,
	ignoreHTTPSErrors: true,
	devtools: false,
	width: 800,
	height: 600,
	disableInfobars: false,
	chromeArgs: [],
	// wait for 4 seconds by default when finding elements
	implicitWaitTime: 4000,
	// Sulfide will poll the page to find elements
	pollInterval: 200,
	// When running Sulfide with Jasmine, assertions can use jasmine assertions to fail tests
	jasmine: false,
};
/* eslint-enable no-magic-numbers */

/**
 * Set the configuration that Sulfide will use when launching a browser
 * @param  {Object} config The configuration object
 * @return {Object} The full configuration of Sulfide after adding the new
 * config.
 */
Sulfide.configure = config => {
	// Immutability
	const __config = Object.assign({}, config); // eslint-disable-line no-underscore-dangle

	if ( __config.chromeArgs ) {
		if ( !Array.isArray(__config.chromeArgs) ) {
			throw new Error('chromeArgs should be an array of strings');
		}

		// immutability by using filter
		__config.chromeArgs = __config.chromeArgs.filter(arg => (
			typeof arg === 'string' &&
			arg.trim().indexOf('--no-sandbox') !== 0 &&
			arg.trim().indexOf('--disable-setuid-sandbox') !== 0 &&
			arg.trim().indexOf('--window-size') !== 0 &&
			arg.trim().indexOf('--disable-infobars') !== 0 &&
			arg.trim().indexOf('--app') !== 0
		));
	}

	Sulfide.config = Object.assign({}, _DEFAULT_CONFIG_);
	for ( const k in config ) {
		if ( __config.hasOwnProperty(k) ) {
			Sulfide.config[k] = __config[k];
		}
	}

	return Sulfide.config;
};

// Set the default configuration
Sulfide.configure({});

/**
 * Can be used to sleep the execution of a async function. Usage:
 *
 * await $.sleep(5000); // Sleep for 5 seconds
 *
 * @param  {number} timeout The sleep time in milliseconds
 * @return {Promise} Resolves after timeout milliseconds
 */
Sulfide.sleep = timeout => new Promise(resolve => {
	setTimeout(() => resolve(), timeout);
});

/**
 * Creates the options object that is used to launch Chromium
 * @return {Object} The options that are used to launch Chromium through Puppeteer
 */
Sulfide.getBrowserLaunchOptions = () => {
	const options = {
		headless: Sulfide.config.headless,
		ignoreHTTPSErrors: Sulfide.config.ignoreHTTPSErrors,
		devtools: Sulfide.config.devtools,
		args: [
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--window-size=' + Sulfide.config.width + ',' + Sulfide.config.height,
			...Sulfide.config.chromeArgs,
		],
	};

	if ( Sulfide.config.disableInfobars ) {
		options.args.push('--disable-infobars');
	}

	if ( launchUrl ) {
		options.args.push('--app=' + launchUrl);
	}

	return options;
};

/**
 * Opens a browser if necessary and navigates to the given URL.
 * @param  {String} url Url of the page that will be navigated to.
 */
Sulfide.open = async url => {
	if ( !browser ) {
		launchUrl = url;
		const options = Sulfide.getBrowserLaunchOptions();
		browser = await puppeteer.launch(options);
	}

	const page = await Sulfide.getPage();
	await page.goto(url, {waitUntil: 'load'});
};

/**
 * Closes the browser
 * @return {Promise} Promise that will be resolved when the browser is closed
 */
Sulfide.close = async () => {
	await browser.close();
	browser = null;
};

/**
 * Gets the current page. Will create a new page if there are no pages
 * and the browser has been launched.
 * @return {Promise} Promise will resolve with a reference to the page.
 */
Sulfide.getPage = async () => {
	if ( !browser ) {
		return null;
	}

	const pages = await browser.pages();
	if ( pages.length > 0 ) {
		return pages[pages.length - 1];
	}

	const page = await Sulfide.newPage();
	return page;
};

/**
 * Creates a new page when the browser has been launched
 * @return {Promise} Resolves to a reference to the new page,
 * or to null when no browser exists.
 */
Sulfide.newPage = async () => {
	if ( !browser ) {
		return null;
	}

	const page = await browser.newPage();
	await page.setViewport({
		width: Sulfide.config.width,
		height: Sulfide.config.height,
	});
	return page;
};

/**
 * Returns the reference to the launched browser or null if
 * no browser exists.
 * @return {Browser} A reference to the browser instance
 */
Sulfide.getBrowser = () => browser;

/**
 * Returns all the pages opened in the browser.
 * @return {Promise} Will resolve with an array of all opened pages
 */
Sulfide.getPages = async () => {
	if ( !browser ) {
		return [];
	}
	return browser.pages();
};

// Add the selectors to Sulfide
for ( const selector in Selectors ) {
	if ( Selectors.hasOwnProperty(selector) ) {
		Sulfide[selector] = Selectors[selector];
	}
}

// Add everything to the global namespace for easy usage
if ( !Sulfide.config.noGlobals ) {
	global.$ = Sulfide;
	global.$$ = $$;

	// Add the selectors
	for ( const selector in Selectors ) {
		if ( Selectors.hasOwnProperty(selector) ) {
			global[selector] = Selectors[selector];
		}
	}

	// Add the conditions
	for ( const condition in Conditions ) {
		if ( Conditions.hasOwnProperty(condition) ) {
			global[condition] = Conditions[condition];
		}
	}
}

module.exports = Sulfide;
