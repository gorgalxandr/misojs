/*
	Main Miso MVC generator - this is a singleton to load all controllers
	and map their routes on startup of app. If a route is unmapped, we 
	(optionally) throw an error.
*/
var fs			= require('fs'),
	path		= require('path'),
	_			= require('lodash'),
	routes		= {},
	serverConfig,
	permissions = require('../cfg/permissions.json'),
	m = require('mithril'),
	miso = require('../server/miso.util.js'),
	permit = require('../server/miso.permissions.js'),
	sugartags = require('mithril.sugartags')(m),
	bindings = require('../server/mithril.bindings.node.js')(m),
	//templates = require('../server/mithril.templates.node.js'),
	vm = require('vm'),
	cp = require('child_process'),
	mithrilRender = require('mithril-node-render'),
	beautify_html = require('js-beautify').html,
	//	Force the browserify process to run
	forceBrowserify = false,
	//	What node we attach our app to in the layout
	misoAttachmentNode = "misoAttachmentNode",
	attachmentNodeSelector = "document.getElementById('"+misoAttachmentNode+"')",

	layoutView = require('../mvc/layout.js').index,
	mainView = require('../system/main.view.js').index,
	//	View for API files
	apiClientView = require('../system/api.client.view.js').index,
	apiServerView = require('../system/api.server.view.js').index,
	adaptorPath = "../",
	//	Where we put our API files
	apiDirectory = './system/adaptor/',
	//	Where we put adaptor override files
	moduleAdaptorDirectory = './modules/adaptor/',

	apiClientFile = 'api.client.js',
	apiServerFile = 'api.server.js',

	render = function(view, ignorePretty){
		if(serverConfig.pretty && !ignorePretty) {
			return beautify_html(mithrilRender(view), {
				wrap_line_length: 999999
			});
		} else {
			return mithrilRender(view);
		}
	},

	//  Puts the lotion on its...
	skin = function(content) {
		return render(layoutView({
			reload: serverConfig.reload,
			misoAttachmentNode: misoAttachmentNode,
			content: content
		}));
	},
	getExtension = function(filename) {
		var ext = path.extname(filename||'').split('.');
		return ext[ext.length - 1];
	}, 
	hasMappedRouteActions = {};


//	Map the routes for the controllers
//	This generates the client side code from our routes/controller/views
module.exports = function(app, options) {

	serverConfig = require('../system/config.js')(app.get('environment'));

	var routesPath = __dirname + "/../mvc/",
		auth = require('../system/auth.js')(app, serverConfig.authKey);

	//	Add any adaptors
	if(serverConfig.adaptor) {
		var adaptors = _.isArray(serverConfig.adaptor)? 
			serverConfig.adaptor: 
			[serverConfig.adaptor],
			adaptorRequirePath,
			apiDir = apiDirectory,
			myAdaptorPath = adaptorPath;

		_.forOwn(adaptors, function(adaptor){

			//	Check the module adaptor directory first
			if(fs.existsSync(moduleAdaptorDirectory + adaptor + '/' + adaptor + '.adaptor.js')) {
				apiDir = moduleAdaptorDirectory;
				adaptorRequirePath = "../." + moduleAdaptorDirectory + adaptor + '/' + adaptor + '.adaptor.js';
				myAdaptorPath = "../../../system/adaptor/";
			} else {
				apiDir = apiDirectory;
				adaptorRequirePath = undefined;
				myAdaptorPath = adaptorPath;
			}

			//	Create API for configured adaptor (serverConfig.adaptor)
			var dbApi = require('./adaptor/api.js')(app, adaptor, serverConfig.apiPath, adaptorRequirePath);

			//	Client file
			fs.writeFileSync(apiDir + adaptor + "/" + apiClientFile, render(apiClientView({
				api: dbApi.client.api
			}), true));

			//	Server file
			fs.writeFileSync(apiDir + adaptor + "/" + apiServerFile, render(apiServerView({
				api: dbApi.server.api,
				adaptor: adaptor,
				adaptorPath: myAdaptorPath
			}), true));
		});
	}

	//	Add configured routes
	if(options.routeConfig) {
		_.forOwn(options.routeConfig, function(routeObj, routePath){
			var file = routeObj.name + ".js",
				routeFile = path.join(routesPath, file),
				route = require(routeFile),
				routeStats = fs.statSync(routeFile),
				routeName = file.substr(0, file.lastIndexOf("."));

			routes[routePath] = routes[routePath] || {};

			_.assign(routes[routePath], {
				route: route,
				method: routeObj.method,
				name: routeObj.name,
				action: routeObj.action,
				path: routePath,
				authenticate: route[routeObj.action].authenticate,
				file: file,
				stats: routeStats
			});

			hasMappedRouteActions[routeObj.name + "." + routeObj.action] = routes[routePath];

		});
	}

	//	Import non configured routes
	fs.readdirSync(routesPath)
		.filter(function(file) {
			//	All js files that don't start with '.' and are not layout.js
			return (file.indexOf('.') !== 0) && (file !== 'layout.js') && getExtension(file) == "js";
		})
		.forEach(function(file) {
			var routeFile = path.join(routesPath, file),
				route = require(routeFile),
				routeStats = fs.statSync(routeFile),
				routeName = file.substr(0, file.lastIndexOf(".")),
				routePath = "/" + routeName,
				method = "get",
				//	TODO: The id, delete, new can be translated perhaps?
				idPostfix = "_id",
				deleteKeyword = "delete",
				newKeyword = "new";

			/*
				Here we generate routes based on supported action names, auto-mapped actions are:

				Action 		Method 		URL 						Description

				index 		GET 		[controller] + 's'			List the items
				edit 		GET 		[controller]/[id]			Display a form to edit the item
				new 		GET 		[controller] + 's' + /new 	Display a form to add a new item

				Note: We are using RESTful-style URLs, but only GET and POST here,
					we could obviously add PUT, DELETE and so on, but we're keeping 
					this basic for now. This is because some browsers, eg: IE7/IE8
					do not properly support PUT and DELETE, so it's safer to exclude
					those methods. I know this is opinionated behaviour, but you can
					always add a custom route if you really want it.

				Ref:
				http://stackoverflow.com/questions/2456820/problem-with-jquery-ajax-with-delete-method-in-ie

				Action naming convention refs:
				http://mvccontrib.codeplex.com/wikipage?title=SimplyRestfulRouting&referringTitle=Documentation
				http://stephenwalther.com/archive/2008/06/27/asp-net-mvc-tip-11-use-standard-controller-action-names

			*/
			_.forOwn(route, function(idx, action){
				if(!hasMappedRouteActions[routeName + "." + action]) {
					//	Note: The list is pluralised with an s always, 
					//	so name your controller accordingly, eg: don't 
					//	name it 'users', it should be 'user'
					//	TODO: provide international pluralisation via
					//	i18next or similar
					switch (action) {
						//	Display an index page with a list of items
						case 'index':
							method = 'get';
							routePath = '/' + routeName + 's';
							break;
						//	An item to edit
						case 'edit':
							method = 'get';
							routePath = '/' + routeName + '/:' + routeName + idPostfix;
							break;
						//	New item
						case 'new':
							method = 'get';
							routePath = '/' + routeName + 's/' + newKeyword;
							break;
						default:
							var message = 'ERROR: unmapped action: "' + routeName + '.' + action + '" - please map it or make it a private function';
							if(options.throwUnmappedActions) {
								throw new Error(message);
							} else {
								options.verbose && console.log(message);
							}
					}

					routes[routePath] = {
						route: route,
						method: method,
						name: routeName,
						action: action,
						path: routePath,
						file: file,
						stats: routeStats
					};
				}
			});
		});

	var routeMap = {},
		//	route, name, path, method, action
		createRoute = function(args) {

			//	Add pointer to models for use in store/save/whatever we call it...
			if(args.route[args.action].models) {
				GLOBAL.misoModels = GLOBAL.misoModels || {};
				for(var m in args.route[args.action].models) {
					var key = "model." + args.name + "." + args.action + "." + m
						value = args.route[args.action].models[m];

					app.set(key, value);
					GLOBAL.misoModels[key] = value;
				}
			}

			//	Setup the route
			var myRoute = function(req, res, next) {

				//	Here I need the user roles - let's assume we can
				//	use the session...
				//sess=req.session;
				var permitObj = permissions["app"][args.name + "." + args.action],
					//	TODO: hard coded user should be real
					user = req.session && req.session.user? req.session.user: {
						name: "you",
						roles: ['admin']
					};

				if(!permit.app(permitObj, user)){
					//	ACCESS DENIED - show login page?
					return res.end(skin(["ACCESS DENIED"],{}));
				}

				try{
					var scope = args.route[args.action].controller({params: req.params, query: req.query}),
						bindScope = args.route[args.action].controller,
						mvc = args.route[args.action];

					//	Check for ready binder - we only use
					//	it if there is asyc data loading to be done,
					//	to maintain compatibility with mithril-style
					//	requests.
					if (!bindScope._misoReadyBinding) {
						//options.verbose && console.log("No blocking binding:", args.action + " - " + args.path);
						res.end(skin(_.isFunction(mvc.view)? 
							mvc.view(scope): 
							mvc.view, 
						scope));
					} else {
						//options.verbose && console.log("Blocking binding:", args.action + " - " + args.path);
						//	Add "last" binding for miso ready event
						bindScope._misoReadyBinding.bindLast(function() {
							res.end(skin(_.isFunction(mvc.view)? 
								mvc.view(scope): 
								mvc.view, 
							scope));
						});
					}
				} catch(ex){
					var problem = args.action + " - " + args.path + " threw: " + ex;
					console.log(ex, problem);
					next(problem);
				}
			};

			//	Apply authentication if specified
			if(args.authenticate) {
				console.log('apply auth...', args.path);
				app[args.method](args.path, auth(args.authenticate), myRoute);
			} else {
				app[args.method](args.path, myRoute);
			}

			options.verbose && console.log('    %s %s -> %s.%s', args.method.toUpperCase(), args.path, args.name, args.action);
			routeMap[args.path] = args;
		};

	//	Grab our controller file names
	var routeList = [],
		mainFile = './system/main.js',

		output = "./client/miso.js",
		outputMap = "./client/miso.map.json",
		//	If the server config wants a minified miso.js
		browserifyCmd = serverConfig.minify? 
			"browserify -t ./system/browserifymiso " + mainFile + " -d -p [minifyify --map /miso.map.json --output "+outputMap+"] >" + output:
			"browserify -t ./system/browserifymiso " + mainFile + " >" + output,

		mainFileModified = fs.existsSync(mainFile)? fs.statSync(mainFile).mtime: new Date(1970,0,1),
		lastRouteModified = new Date(1970,0,1);


	//	Sort routes so that "new" comes before "index", otheriwse index 
	//	will override it
	var routeKeys = Object.keys(routes).map(function(key) {
		return key;
	});

	routeKeys = routeKeys.sort(function(a,b){
		return a.indexOf("/new") != -1? -1:
			b.indexOf("/new") != -1? 1:
			a > b;
	});

	options.verbose && console.log('');
	options.verbose && console.log('Miso app route map');
	options.verbose && console.log('');

	//	Create routes and generate list of routes
	_.forOwn(routeKeys, function(action){
		var route = routes[action];
		//	Check controller timestamp
		lastRouteModified = (lastRouteModified > route.stats.mtime)?
			lastRouteModified: 
		 	route.stats.mtime;
		routeList.push(route);
		createRoute(route);
	});


	//	Output our main JS file for browserify
	fs.writeFileSync(mainFile, render(mainView({
		routes: routeList,
		permissions: JSON.stringify(permissions),
		attachmentNodeSelector: attachmentNodeSelector
	}), true));

	//	Run browserify when either a controller or view has changed.
	//	We use exec to run it - this gives us a little more flexibility
	//	Set MISOREADY when we are up and running
	if(forceBrowserify || lastRouteModified > mainFileModified) {
		cp.execSync(browserifyCmd);
		process.nextTick(function(){
			app.set("MISOREADY", true);
		});
	} else {
		app.set("MISOREADY", true);
	}
};