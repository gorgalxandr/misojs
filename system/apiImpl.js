/* NOTE: This is a generated file, please do not modify it, your changes will be lost */
module.exports = function(m){
	return {
'save': function(){
	console.log('mrrrr', m.request());
	return m.request({
		method:'post', 
		url: '/api/save',
		data: {}
	});
},
'findById': function(){
	console.log('mrrrr', m.request());
	return m.request({
		method:'post', 
		url: '/api/findById',
		data: {}
	});
},
'findByModel': function(){
	console.log('mrrrr', m.request());
	return m.request({
		method:'post', 
		url: '/api/findByModel',
		data: {}
	});
}
	};
};