
/**
 * Name: Motorman
 * Usage:
 *  * var motorman = new Motorman({ router: app, sandbox: new class Sandbox {} });
 *  * motorman
 *  *   .setRoutes(routes)
 *  *   .setPolicies(policies)
 *  *   .setMiddleware(middleware)
 *  *   .setControllers(controllers)
 *  *   .bootstrap()
 *  *   ;
 *  *
 * TODO: 
 *  * Write tests
 *  * Publish as NPM Module
 */
var { ROUTER_METHOD_MAP, CONTROLLER_METHOD_MAP } = require('./maps');

const Dictionary = Map;

class Command {
    
    constructor(context, action) {
        this.context = context;
        this.action = action;
        return this;
    }
    
    execute(...splat) {
        var { context, action } = this;
        return context[action].call(context, ...splat);
    }
    
}

class Delegate {
    
    constructor(options = { name: '', type: undefined, instance: undefined }) {
        var { name, type, instance } = options;
        
        this.name = name;
        this.type = type;
        this.instance = instance;
        
        return this;
    }
    
}

class Motorman {
    
    constructor({ router, sandbox }) {
        this.router = router;
        this.sandbox = sandbox;
        this.routes = [ ];
        this.policies = [ ];
        this.middleware = { };
        this.controllers = { };
        this.delegations = [ ];
        this.$middleware = new Dictionary();
        this.$controllers = new Dictionary();
        this.$delegates = new Dictionary();
        
        return this;
    }
    
    setRoutes(data) {
        this.routes = [ ...data ];
        return this;
    }
    
    setPolicies(definitions) {
        this.policies = [ ...this.policies, ...definitions ];
        return this;
    }
    
    setMiddleware(delegates) {
        this.middleware = { ...delegates };
        return this;
    }
    
    setControllers(delegates) {
        this.controllers = { ...delegates };
        return this;
    }
    
    bootstrap() {
        var { policies, routes, middleware, controllers, $middleware, $controllers } = this;
        
        this
          .initDelgates(middleware, $middleware)  // create & store instances
          .initDelgates(controllers, $controllers)  // create & store instances
          .mapDelegations(policies, routes)  // create refined version of routes from policy declarations (policy-mapped routes)
          .mapDelgates(this.delegations)  // map & add handler-pipeline to delegations (policy-mapped routes)
          .attach(this.delegations)  // attach to router (router.[use|all|get|post|put|delete])
          ;
        return this;
    }
    
    initDelgates(delegates, $store) {  // see this.initDelegate()
        var { sandbox: $ } = this;
        for (let name in delegates) this.initDelegate($, $store, delegates[name], name, delegates);
        return this;
    }
    initDelegate($, $store, Class, name) {  // create instance of a "delegate" (middleware-method or controller-action)
        var instance = new Class($), delegate = new Delegate({ name, instance });
        $store.set(name, delegate);
        this.$delegates.set(name, delegate);
        
        return this;
    }
    mapDelegations(policies, routes) {  // set "delegations" (policy-mapped route declarations)
        var delegations = [ ...routes ];  // Copy routes first (mapPolicy replaces nth route with mapped version)
        policies.forEach( (p) => this.mapPolicy(delegations, p) );
        this.delegations = delegations;
        
        return this;
    }
    mapPolicy(delegations, policy) {
        delegations.forEach( (r, i, a) => this.createPolicyMapping(policy, r, i, a) );
        return this;
        
    }
    createPolicyMapping(policy, route, i, routes) {  // replaces a route-declaration object with a "delegation" from policies
        var { uri = '*', method = '*', policies: pPolicies = [] } = policy;
        var { uri: rUri, method: rMethod, policies: rPolicies = [] } = route;
        var pPolicies = [].concat(pPolicies), rPolicies = [].concat(rPolicies), policies = pPolicies.concat(rPolicies)
        var uris = { '': true, '*': true, [rUri]: true }, methods = { '': true, '*': true, [rMethod]: true };
        var delegation = { ...route, policies };
        var bothMatch = !!(uris[uri] && methods[method])
          , onlyMatch = !!( (!method && uris[uri]) || (!uri && methods[method]) )
          ;
        if (bothMatch) routes[i] = delegation;  // uri is ''|* (all) or same (matches) AND method is ''|* (all) or same (matches)
        if (onlyMatch) routes[i] = delegation;  // no method provided while uris match OR no uri provided while methods match
    }
    
    mapDelgates(routes) {  // map middleware & controllers (roll up into handlers array of commands)
        var delegations = routes.map( (r, i, a) => this.mapDelgate(r, i, a) );
        this.delegations = delegations;
        return this;
    }
    mapDelgate(route) {  // take a delegation (policy-mapped route) & derive handler-commands pipeline from delegate (controller-action & middleware)
        var { controller: name, action, policies } = route, policies = [].concat(policies);
        var delegate = this.$delegates.get(name) || new Delegate(), controller = delegate.instance;
        var command = new Command(controller, action), handler = command.execute.bind(command);
        var delegates = this.getDelegates(policies), handlers = delegates.concat(handler);
        var delegation = { ...route, handlers };
        
        if (!controller) delegation = { ...route, handlers: delegates };
        if (controller && !controller[action]) throw new Error(`Controller Action Not Found: the Controller "${name}" has no Action ${action}`);
        return delegation;
    }
    getDelegates(names) {  // see this.mapDelegate()
        var delegates = names.map( (n, i, a) => this.getDelegate(n, i, a) );
        return delegates;
    }
    getDelegate(name) {  // see this.mapDelegate()
        var delegate = this.$delegates.get(name) || new Delegate(), instance = delegate.instance, action = 'execute';
        var command = new Command(instance, action), handler = command.execute.bind(command);
        
        if (!delegate.instance) throw new Error(`Delegate Not Found: the Delegate "${name}" has no instance`);
        if (!instance[action]) throw new Error(`Controller Action Not Found: the Delegate "${name}" has no Action ${action}`);
        return handler;
    }
    
    
    attach(routes) {
        routes.forEach( (r, i, a) => this.mount(r, i, a) );
        return this;
    }
    mount(route) {  // mount delegations (middleware + controller-action) pipeline to router
        var { router } = this;
        var { uri, method, handlers } = route;
        var type = ROUTER_METHOD_MAP[method];  // .use(), .all(), .get(), .post(), .put(), .delete()
        
        router[type].call(router, uri, handlers);
        return this;
    }
    
}

module.exports = Motorman;


/**
 * |
 * | Experimental
 * V
 */

class EventHub {
    
    constructor() {}
    
    publish() {}
    subscribe() {}
    unsubscribe() {}
    
}

var Deferred = new (function Deferred() {
    var _this = this;  // private context
    var _resolve = null, _reject = null;
    
    function exe(resolve, reject) {
        this.resolve = resolve;
        this.reject = reject;
    }
    
    class Deferred {
        
        constructor() {
            var promise = new Promise( exe.bind(this) );
            this.promise = promise;
            return this;
        }
        
        resolve(data) {
            _this.resolve(data);
            return this.promise;
        }
        reject(data) {
            _this.reject(data);
            return this.promise;
        }
        
    }
    
    // export precepts
    this.resolve = _resolve;
    this.reject = _reject
    
    return this;
})();

/**
 * Note:
 *  * Seems like there is a common pattern to Motorman, DelegatesManager and DelegationsManager. Each has an abstract interface of at least:
 *      * get a() {}
 *      * get b() {}
 *      * get instances() {}
 *      * this.x = new Deferred();
 *      * this.ready
 *      * this.stable
 *      * bootstrap()
 *      * handleItem()
 */
var Motorman = new (function Motorman(Superclass) {
    var _this = this;  // private context
    
    class Motorman extends Superclass {
        
        get routes() { return this.delegations.routes; }
        get policies() { return this.delegations.policies; }
        get delegations() { return this.delegations.instances; }
        
        get middleware() { return this.delegates.middleware; }
        get controllers() { return this.delegates.controllers; }
        get delegates() { return this.delegates.instances; }
        
        constructor({ router, sandbox }) {
            var delegates = new DelegatesManager(sandbox)
              , delegations = new DelegationsManager(delegates)
              , dBootstrap = new Deferred()
              , pBootstrap = dBootstrap.promise
              , pReady = Promise.all([ delegates.ready, delegations.ready ]).then( () => ({ ready: true }) )  // (pending)
              , pStable = Promise.all([ delegates.stable, delegations.stable, pBootstrap ]).then( () => ({ stable: true }) )  // (pending)
              ;
            
            pReady
              .then( () => this.bootstrap(delegations.instances) )
              ;
            
            this.router = router;
            this.sandbox = sandbox;
            this.delegates = delegates;
            this.delegations = delegations;
            this.ready = pReady;
            this.stable = pStable;
            
            return this;
        }
        
        define(type, definitions) {
            var { delegations, delegates, delegations, delegates } = this;
            var define = {
                'routes': delegations['set:routes'].bind(delegations),
                'policies': delegations['set:policies'].bind(delegations),
                'middleware': delegates['set:middleware'].bind(delegates),
                'controllers': delegates['set:controllers'].bind(delegates),
            }[ type ];
            
            define(definitions);
            
            return this;
        }
        
        bootstrap(delegations) {
            delegations.forEach( (d, i, a) => this.mount(d, i, a) );
            this.pBootstrap.resolve(this);
            return this;
        }
        mount(delegation) {  // mount delegations (middleware + controller-action) pipeline to router
            var { router } = this;
            var { uri, method, handlers } = delegation;
            var type = ROUTER_METHOD_MAP[method];  // .use(), .all(), .get(), .post(), .put(), .delete()
            
            router[type].call(router, uri, handlers);
            return this;
        }
        
    }
    
    // export precepts
    
    return Motorman;
})(EventHub);
var DelegatesManager = new (function DelegatesManager(Superclass) {
    var _this = this;  // private context
    var _middleware = { }
      , _controllers = { }
      , _instances = { }
      ;
    
    class DelegatesManager extends Superclass {
        
        get middleware() { return Array.from( this.$middleware.values() ); }
        set middleware(value) { this.$middleware.clear(); value.forEach( (m) => this.$middleware.set(m.name, m) ); }
        
        get controllers() { return Array.from( this.$controllers.values() ); }
        set controllers(value) { this.$controllers.clear(); value.forEach( (c) => this.$controllers.set(c.name, c) ); }
        
        get instances() { return Array.from( this.$instances.values() ); }
        set instances(value) { this.$instances.clear(); value.forEach( (d) => this.$instances.set(d.name, d) ); }
        
        constructor(sandbox) {
            var $middleware = new Dictionary()
              , $controllers = new Dictionary()
              , $instances = new Dictionary()
              ;
            var dMiddleware = new Deferred()
              , dControllers = new Deferred()
              , dInstances = new Deferred()
              ;
            var pMiddleware = dMiddleware.promise
              , pControllers = dControllers.promise
              , pInstances = dInstances.promise
              , pReady = Promise.all([ pInstances, pControllers ]).then( ([middleware, controllers]) => ({ middleware, controllers }) )
              , pStable = Promise.all([ pReady, pDelegates ]).then( ([ready, instances]) => ({ instances }) )
              ;
            // TODO: add event-hooks after require('@motorman/utilities');
            pReady
              .then( ([ m, c ]) => {} )
              ;
            pStable
              .then( ([ m, c, d ]) => {} )
              ;
            
            this.sandbox = sandbox;
            this.$middleware = $middleware;
            this.$controllers = $controllers;
            this.$instances = $instances;
            this.pMiddleware = pMiddleware;
            this.pControllers = pControllers;
            this.pInstances = pInstances;
            this.pReady = pReady;
            this.pStable = pStable;
            
            return this;
        }
        
        ['set:middleware'](definitions) {
            var { $middleware } = this, definitions = { ...definitions }, collection = [ ];
            
            for (let name in definitions) collection.push( new Delegate({ name, type: definitions[name], instance: undefined }) );
            this.middleware = collection;
            this.pMiddleware.resolve($middleware);
            
            return this;
        }
        ['set:controllers'](definitions) {
            var { $controllers } = this, definitions = { ...definitions }, collection = [ ];
            
            for (let name in definitions) collection.push( new Delegate({ name, type: definitions[name], instance: undefined }) );
            this.controllers = collection;
            this.pControllers.resolve($controllers);
            
            return this;
        }
        
        load() {
            var { $middleware, $controllers, $instances } = this;
            for (let delegate of $middleware) this.instantiate(delegate);
            for (let delegate of $controllers) this.instantiate(delegate);
            this.pInstances.resolve($instances);
        }
        instantiate(delegate) {
            var { sandbox } = this, { name, type: Class, instance: existing } = delegate, instance = new Class(sandbox);
            Delegate.call(delegate, { instance });  // update `Delegate {...}` as `Delegate { ..., instance: Class {...} }`
            this.$instances.set(name, delegate);
        }
        
    }
    
    // export precepts
    this.middleware = _middleware;
    this.controllers = _controllers;
    this.instances = _instances;
    
    return this;
})(EventHub);
var DelegationsManager = new (function DelegationsManager(Superclass) {
    var _this = this;  // private context
    var _routes = [ ]
      , _policies = [ ]
      , _instances = [ ]
      ;
    
    function keyOf(route) {
        var { uri, method } = route, key = `${method} ${uri}`;
        return key;
    }
    
    function getDelegateInstances($store, names) {
        var names = names.reduce( (array, n) => array.concat(n), [] )  // ensure no multidimentionality (flatten)
          , names = names.filter( (n) => !!n )  // ensure !!~names.indexOf(undefined)
          , delegates = names.map( (name) => $store.get(name) )
          , delegates = delegates.filter( (d) => !!d )  // ensure !!~delegates.indexOf(undefined)
          , instances = delegates.map( (delegate) => delegate.instance )
          ;
        return instances;
    }
    
    function getHandlers(instances) {
        var handlers = instances.map( (m) => m['execute'].bind(m) );
        return handlers;
    }
    
    class DelegationsManager extends Superclass {
        
        get routes() { return Array.from( this.$routes.values() ); }
        set routes(value) { this.$routes.clear(); value.forEach( (r) => this.$routes.set(keyOf(r), r) ); }
        
        get policies() { return Array.from( this.$policies.values() ); }
        set policies(value) { this.$policies.clear(); value.forEach( (p) => this.$policies.set(keyOf(p), p) ); }
        
        get instances() { return Array.from( this.$instances.values() ); }
        set instances(value) { this.$instances.clear(); value.forEach( (p) => this.$instances.set(keyOf(p), p) ); }
        
        constructor(delegates) {
            var $routes = new Dictionary()
              , $policies = new Dictionary()
              , $instances = new Dictionary()
              ;
            var dRoutes = new Deferred()
              , dPolicies = new Deferred()
              , dInstances = new Deferred()
              ;
            var pRoutes = dRoutes.promise
              , pPolicies = dPolicies.promise
              , pInstances = dInstances.promise
              , pReady = Promise.all([ pRoutes, pPolicies, delegates.ready ]).then( ([ routes, policies ]) => ({ routes, policies }) )
              , pStable = Promise.all([ pReady, pInstances ]).then( ([ ready, instances ]) => ({ instances }) )
              ;
            
            pReady
              .then( ([ m, c ]) => this.generate() )
              ;
            
            this.delegates = delegates;
            this.$routes = $routes;
            this.$policies = $policies;
            this.$instances = $instances;
            this.pRoutes = pRoutes;
            this.pPolicies = pPolicies;
            this.pInstances = pInstances;
            this.ready = pReady;
            this.stable = pStable;
            
            return this;
        }
        
        ['set:routes'](routes) {
            this.routes = routes;
            this.pRoutes.resolve(routes);
            return this;
        }
        ['set:policies'](policies) {
            this.policies = policies;
            this.pPolicies.resolve(policies);
            return this;
        }
        
        generate() {
            var { routes } = this;
            var instances = routes.map( (r) => this.map(r) );
            
            this.instances = instances;
            this.pInstances.resolve(instances);
            
            return this;
        }
        map(route) {
            var { $policies, delegates } = this;
            var { uri, method, controller, action, policies } = route;
            
            // begin @ controller-action
            var key = keyOf(route), policy = $policies.get(key);
            var endpoint = controller
              , delegate = delegates.$instances.get(endpoint)
              , instance = delegate.instance
              , method = instance[action].bind(instance)  // last hit handler
              ;  // end @ controller-action
            
            // begin @ [specific] route-matching middleware
            var pipeline = [].concat(policy.policies, policies)
              , infraware = getDelegateInstances(delegates.$instances, pipeline)  // last hit middleware
              ;  // end @ specific middleware handlers
            
            // begin @ [generic] catch-all middleware
            var allMethodsKey =     keyOf({ method: '*', uri }),    allURIsKey =    keyOf({ method, uri: '*' }),    allKey =    keyOf({ method: '*', uri: '*' })
              , absentMethodsKey =  keyOf({ method: '', uri }),     absentURIsKey = keyOf({ method, uri: '' }),     absentKey = keyOf({ method: '', uri: '' })
              , keys = [ allMethodsKey, allURIsKey, allKey, absentMethodsKey, absentURIsKey, absentKey ]
              ;  // end @ keys for policies { method: x, uri: y } e.g: { method: '*', uri: '*' } (run on all)
            var pipeline = keys.map( (key) => $policies.get(key) )  // e.g: ['SomePolicy', ['SomePolicy']. undefined]
              , supraware = getDelegateInstances(delegates.$instances, pipeline)  // first hit middleware
              ;  // end @ generic middleware handlers
            
            var middleware = getHandlers([ ...supraware, ...infraware ]), handlers = [ ...middleware ];  // aggregate supra (1st) & infra (2nd)
            var delegation = { uri, method, controller, action, policies, handlers };
            
            handlers.push(method);  // push controller method to end of handlers pipeline (aggregate final handler in pipeline)
            handlers.forEach( (handler) => !!handler.init && handler.init({ route }) );
            
            return delegation;
        }
        
    }
    
    // export precepts
    this.routes = _routes;
    this.policies = _policies;
    this.instances = _instances;
    
    return DelegationsManager;
})(EventHub);
