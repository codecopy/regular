var node = require("./parser/node.js");
var dom = require("./dom.js");
var animate = require("./helper/animate.js");
var Group = require('./group.js');
var _ = require('./util');
var combine = require('./helper/combine.js');

var walkers = module.exports = {};

walkers.list = function(ast){
  var placeholder = document.createComment("Regular list");
  // proxy Component to implement list item, so the behaviar is similar with angular;
  var Section =  Regular.extend( { 
    template: ast.body, 
    $context: this.$context
  });
  Regular._inheritConfig(Section, this.constructor);

  var fragment = dom.fragment();
  fragment.appendChild(placeholder);
  var self = this;
  var group = new Group();
  var indexName = ast.variable + '_index';
  var variable = ast.variable;
  // group.push(placeholder);


  function update(newValue, splices){
    if(!splices || !splices.length) return;
    var cur = placeholder;
    var m = 0, len=newValue.length,
      mIndex = splices[0].index;

    for(var i=0; i < splices.length; i++){ //init
      var splice = splices[i];
      var index = splice.index;

      for(var k = m; k < index; k++){ // no change
        var sect = group.get(k);
        sect.data[indexName] = k;
      }
      for(var j = 0,jlen = splice.removed.length; j< jlen; j++){ //removed
        var removed = group.children.splice( index, 1)[0];
        // var removed = group.children.splice(j,1)[0];
        var parent = removed.$parent
        removed.destroy();
      }

      for(var o=index; o < index + splice.add; o++){ //add
        // prototype inherit
        var item = newValue[o];
        var data = _.createObject(self.data);
        data[indexName] = o;
        data[variable] = item;

        var section = new Section({data: data, $parent: self });


        // autolink
        var insert = o !== 0 && group.children[o-1]? combine.last(group.get(o-1)) : placeholder;
        // animate.inject(combine.node(section),insert,'after')
        animate.inject(combine.node(section),insert,'after');
        // insert.parentNode.insertBefore(combine.node(section), insert.nextSibling);
        group.children.splice(o , 0, section);
      }
      m = index + splice.add - splice.removed.length;
      m  = m < 0? 0 : m;

    }
    if(m < len){
      for(var i = m; i < len; i++){
        var pair = group.get(i);
        pair.data[indexName] = i;
      }
    }

  }


  var watchid = this.$watch(ast.sequence, update);

  return {
    node: function(){
      return fragment;
    },
    group: group,
    destroy: function(){
      group.destroy();
      dom.remove(placeholder);
    }
  }
}

walkers.template = function(ast){
  var content = ast.content, compiled;
  var placeholder = document.createComment('template');
  var compiled;
  // var fragment = dom.fragment();
  // fragment.appendChild(placeholder);
  if(content){
    var self = this;

    this.$watch(content, function(value){
      if(compiled) compiled.destroy(true);
      compiled = self.$compile(value, {record: true}); 
      node = combine.node(compiled);
      animate.inject(node, placeholder, 'before')
    });
  }
  return {
    node: function(){
      return placeholder;
    },
    last: function(){
      return compiled.last();
    },
    destroy: function(first){
      compiled && compiled.destroy(first);
    }
  }
};


// how to resolve this problem
var ii = 0;
walkers['if'] = function(ast, options){
  var self = this, consequent, alternate;
  if(options && options.element){ // attribute inteplation
    var update = function(nvalue){
      if(!!nvalue){
        if(alternate) combine.destroy(alternate)
        if(ast.consequent) consequent = self.$compile(ast.consequent, {record: true, element: options.element });
      }else{
        if(consequent) combine.destroy(consequent)
        if(ast.alternate) alternate = self.$compile(ast.alternate, {record: true, element: options.element});
      }
    }
    this.$watch(ast.test, update, { force: true });
    return {
      destroy: function(){
        if(consequent) combine.destroy(consequent);
        else if(alternate) combine.destroy(alternate);
      }
    }
  }


  var test, consequent, alternate, node;
  var placeholder = document.createComment("Regular if" + ii++);
  var fragment = dom.fragment();
  fragment.appendChild(placeholder);

  var update = function (nvalue, old){
    if(!!nvalue){ //true
      if(consequent) return;
      if(alternate){ alternate.destroy(true) };
      if(ast.consequent && ast.consequent.length){
        consequent = self.$compile( ast.consequent , {record:true})
        node = combine.node(consequent); //return group
        alternate = null;
        // placeholder.parentNode && placeholder.parentNode.insertBefore( node, placeholder );
        animate.inject(node, placeholder, 'before');
      }
    }else{ //false
      if(alternate) return;
      if(consequent){ consequent.destroy(true); }
      consequent = null;
      if(ast.alternate && ast.alternate.length){
         alternate = self.$compile(ast.alternate, {record:true});
        node = combine.node(alternate);
        animate.inject(node, placeholder, 'before');
      }
    }
  }
  this.$watch(ast.test, update, {force: true});

  return {
    node: function(){
      return fragment;
    },
    last: function(){
      var group = consequent || alternate;
      return group && group.last();
    },
    destroy: function destroy(first){
      if(alternate) alternate.destroy(first);
      if(consequent) consequent.destroy(first);
      dom.remove(placeholder);
    }
  }
}


walkers.expression = function(ast){
  var node = document.createTextNode("");
  this.$watch(ast, function(newval){
    dom.text(node, "" + (newval == null? "": String(newval)));
  })
  return node;
}
walkers.text = function(ast){
  var node = document.createTextNode(ast.text);
  return node;
}


var eventReg = /^on-(.+)$/

walkers.element = function(ast){
  var attrs = ast.attrs, 
    component, self = this,
    Constructor=this.constructor,
    children = ast.children,
    Component = Constructor.component(ast.tag);



  if(children && children.length){
    var group = this.$compile(children);
  }


  if(Component){
    var data = {},events;
    for(var i = 0, len = attrs.length; i < len; i++){
      var attr = attrs[i];
      var value = attr.value||"";
      _.touchExpression(value);
      var name = attr.name;
      var etest = name.match(eventReg);
      // bind event proxy
      if(etest){
        events = events || {};
        events[etest[1]] = _.handleEvent.call(this, value, etest[1]);
        continue;
      }

      if(value.type !== 'expression'){
        data[attr.name] = value;
      }
    }

    if(ast.children) var $body = this.$compile(ast.children);
    var component = new Component({data: data, events: events, $body: $body, $parent: this});
    for(var i = 0, len = attrs.length; i < len; i++){
      var attr = attrs[i];
      var value = attr.value||"";
      if(value.type === 'expression' && attr.name.indexOf('on-')===-1){
        this.$watch(value, component.$update.bind(component, attr.name))
        if(value.set) component.$watch(attr.name, self.$update.bind(self, value))
      }
    }
    return component;
  }else if(ast.tag === 'r-content' && this.$body){
    return this.$body;
  }

  if(ast.tag === 'svg') this._ns_ = 'svg';
  var element = dom.create(ast.tag, this._ns_, attrs);
  // context element

  var child;

  // may distinct with if else
  var destroies = walkAttributes.call(this, attrs, element, destroies);

  if(ast.tag === 'svg') this._ns_ = null;



  return {
    node: function(){
      if(group && !_.isVoidTag(ast.tag)){
        animate.inject(combine.node(group),element)
      }
      return element;
    },
    last: function(){
      return element;
    },
    destroy: function(first){
      if( first ){
        animate.remove( element, group? group.destroy.bind( group ): _.noop );
      }
      if( destroies.length ) {
        destroies.forEach(function( destroy ){
          if( destroy ){
            if( typeof destroy.destroy === 'function' ){
              destroy.destroy()
            }else{
              destroy();
            }
          }
        })
      }
    }
  }
}

function walkAttributes(attrs, element){
  var bindings = []
  for(var i = 0, len = attrs.length; i < len; i++){
    var binding = this._walk(attrs[i], {element: element, fromElement: true})
    if(binding) bindings.push(binding);
  }
  return bindings;
}

walkers.attribute = function(ast ,options){
  var attr = ast;
  var Component = this.constructor;
  var self = this;
  var element = options.element;
  var name = attr.name,
    value = attr.value || "", directive = Component.directive(name);

  _.touchExpression(value);


  if(directive && directive.link){
    var binding = directive.link.call(self, element, value, name);
    if(typeof binding === 'function') binding = {destroy: binding}; 
    return binding;
  }else{
    if(value.type == 'expression' ){
      this.$watch(value, function(nvalue, old){
        dom.attr(element, name, nvalue);
      });
    }else{
      if(_.isBooleanAttr(name)){
        dom.attr(element, name, true);
      }else{
        dom.attr(element, name, value);
      }
    }
    if(!options.fromElement){
      return {
        destroy: function(){
          dom.attr(element, name, null);
        }
      }
    }
  }

}

// walkers.attributes = function(array, parent){
//   if(parent.type === 'if'){

//   }
//   // make the directive after attribute
//   attrs.sort(function(a, b){
//     var da = Constructor.directive(a.name);
//     var db = Constructor.directive(b.name);

//     if(!db) return !da? 0: 1;
//     if(!da) return -1;
//     return ( b.priority || 1 ) - ( a.priority || 1 );
//   })

//   var node = document.createTextNode(ast.text);
//   return node;
// }

// dada

// function bindAttrWatcher(element, attr, destroies){
  
// }
