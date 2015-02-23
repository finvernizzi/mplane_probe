/**
 * mPlane probe implementing the Capability push, Specification pull model
 *
 * @author fabrizio.invernizzi@telecomitalia.it
 * @version 0.2.0
 *
 * 23022015	Now it is the mPlane probe with multiple capability
 */

var exec = require('child_process').exec,
    mplane = require('mplane')
    ,supervisor = require("mplane_http_transport")
    , _ = require("lodash"),
    url = require('url'),
    async = require("async")
    ,fs = require('fs')
    ,cli = require("cli")
    ,http = require('http');

var CONFIGFILE = "probe.json"; //TODO:This should be overwrittable by cli

//-----------------------------------------------------------------------------------------------------------
// READ CONFIG
var configuration;
try {
    configuration = JSON.parse(fs.readFileSync(CONFIGFILE));
}
catch (err) {
    console.log('There has been an error parsing the configuration file.')
    console.log(err);
    process.exit();
}
//-----------------------------------------------------------------------------------------------------------


// CLI params
cli.parse({
    sourceIP:['i' , 'Source IP' , 'string' , configuration.main.ipAdresses[0]],
    platform:['p' , 'Platform (BSD,MAC,LINUX)' , 'string' , configuration.main.platform],
    systemID:['s' , 'System identification' , 'string' , configuration.main.systemID],
    label:['l' , 'System label' , 'string' , configuration.main.label]
});

var connected = false;
var capability = [];

// Initialize available primitives from the registry
mplane.Element.initialize_registry("registry.json");

var pingCapability = new mplane.Capability();
pingCapability.set_when("now ... future / 1s");
pingCapability.add_parameter({
    type:"destination.ip4",
    constraints:configuration.pinger.constraints
}).add_parameter({
    type:"number",
    constraints:"1 ... 10"
}).add_parameter({
        type:"source.ip4",
        constraints:cli.options.sourceIP
}).add_result_column("delay.twoway")
    .set_metadata_value("System_type","Pinger")
    .set_metadata_value("System_version","0.1a")
    .set_metadata_value("System_ID",cli.options.systemID).update_token();
pingCapability.set_label(configuration.main.pingerLabel);
capability.push(pingCapability);

var traceCapability = new mplane.Capability();
traceCapability.set_when("now ... future / 1s");
traceCapability.add_parameter({
    type:"destination.ip4",
    constraints:configuration.traceroute.constraints
}).add_parameter({
    type:"source.ip4",
    constraints:cli.options.sourceIP
}).add_result_column("c").add_result_column("hops.ip")
    .set_metadata_value("System_type","Tracer")
    .set_metadata_value("System_version","0.1a")
    .set_metadata_value("System_ID",cli.options.systemID).update_token();
traceCapability.set_label(configuration.main.tracerouteLabel);
capability.push(traceCapability);

var httpLatencyCapability = new mplane.Capability();
httpLatencyCapability.set_when("now ... future / 1s");
httpLatencyCapability.add_parameter({
    type:"destination.fqdn",
    constraints:configuration.pinger.constraints
}).add_parameter({
        type:"source.ip4",
        constraints:cli.options.sourceIP
}).add_result_column("delay.twoway")
    .set_metadata_value("System_type","HTTP_delay")
    .set_metadata_value("System_version","0.1a")
    .set_metadata_value("System_ID",cli.options.systemID).update_token();
httpLatencyCapability.set_label(configuration.main.httpLatencyLabel);
capability.push(httpLatencyCapability);

pushCapPullSpec(capability);
var recheck = setInterval(function(){
    if (!connected){
        console.log("Supervisor unreachable. Retry in "+configuration.main.retryConnect/1000 + " seconds...");
        pushCapPullSpec(capability);
    }else{
        console.log("------------------------------");
        console.log("");
        console.log("Checking for Specifications...");
        console.log("");
        console.log("------------------------------");
        clearInterval(recheck);
    }
} , configuration.main.retryConnect);

function pushCapPullSpec(capabilities){
    console.log("***************************");
    console.log("REGISTERING MY CAPABILITIES");
    console.log("***************************\n");
    supervisor.registerCapabilities(capabilities , {
            host: configuration.supervisor.host
            ,port: configuration.supervisor.port
            ,caFile: configuration.ssl.ca
            ,keyFile: configuration.ssl.key
            ,certFile: configuration.ssl.cert
        },function(err , data){
            if (err){
                return false;
            }else{
                connected = true;
                supervisor.checkSpecifications(
                    {
                        host: configuration.supervisor.host
                        ,port: configuration.supervisor.port
                        ,caFile: configuration.ssl.ca
                        ,keyFile: configuration.ssl.key
                        ,certFile: configuration.ssl.cert
                        ,period: configuration.main.ceckSpecificationPeriod
                    }
                    ,function(specification , callback){
                        var label = specification.get_label();
                        switch (label){
                        	case configuration.main.pingerLabel:
                        		execPing( specification , callback);
                        		break;
                        	case configuration.main.tracerouteLabel:
                        		execTraceroute(specification, callback);
                        		break;
                        	case configuration.main.httpLatencyLabel:
                        		execHTTPLatency(specification, callback);
                        		break;
                        	default:
                        		cli.error("Unknown LABEL:"+label);
                        }
						/*if (label ==  configuration.main.pingerLabel){
                            execPing( specification , callback);
                        }
                        if (label ==  configuration.main.tracerouteLabel){
                            execTraceroute(specification, callback);
                        }*/
                    }, function(err){
                        // For some reason we have no capability registered
                        if (err.message == 428){
                            pushCapPullSpec(capabilities);
                        }
                        else
                            console.log(err);
                    }
                );
                return true;
            }
        }
    );

}

function mean(values){
    var sum = 0 , elements = 0;
    _.each(values , function(val , index){
        if (!_.isNaN(val)){
            sum += val*1;
            elements +=1;
        }
    });
    return (sum/elements);
}
/**
 *
 * @param specification The mplane Specification
 */
function execPing(specification, mainCallback){
    var dest = specification.get_parameter_value("destination.ip4");
    var reqNum = specification.get_parameter_value("number");
    var startAction = new Date();
    cli.info("Something to do for me...("+dest+","+reqNum+")");
    async.waterfall([
        function(callback){
            doAPing(dest, 5 , reqNum , callback);
        }
    ], function (err, meanRTT) {
        console.log("delay.twoway <"+dest+">:"+meanRTT);
	specification.set_when(startAction.toISOString() + " ... " + new Date().toISOString());
        supervisor.registerResult(
            specification
            , {
                host: configuration.supervisor.host
                ,port: configuration.supervisor.port
                ,caFile: configuration.ssl.ca
                ,keyFile: configuration.ssl.key
                ,certFile: configuration.ssl.cert
            },{
                "delay.twoway":meanRTT
            }
            ,function(err , data){
                mainCallback();
            }
        ); //supervisor.registerResult
    }); //waterfall
}

/**
 *
 * @param specification The mplane Specification
 */
function execHTTPLatency(specification, mainCallback){
    var dest = specification.get_parameter_value("destination.fqdn");
    var startAction = new Date();
 
    cli.info("Something to do for me...(HTTP Latency: "+dest+")");
    //function(callback){
        var start = new Date();
		http.get({host: dest, port: 80}, function(res) {
			meanRTT = new Date() - start;
    		console.log('Request took:', new Date() - start, 'ms');
    		specification.set_when(startAction.toISOString() + " ... " + new Date().toISOString());
        	supervisor.registerResult(
            specification
            , {
                	host: configuration.supervisor.host
                	,port: configuration.supervisor.port
                	,caFile: configuration.ssl.ca
                	,keyFile: configuration.ssl.key
                	,certFile: configuration.ssl.cert
            	},{
            	    "delay.twoway":meanRTT
            	}
            	,function(err , data){
                	mainCallback();
            	}
        	); //supervisor.registerResult
		});
    //}
}


/**
 *
 * @param specification The mplane Specification
 */
function execTraceroute(specification, mainCallback){
    var dest = specification.get_parameter_value("destination.ip4");
    cli.info("Something to do for me...("+dest+")");
    var startAction = new Date();
    async.waterfall([
        function(callback){
            doATrace(dest , function (err,hops) {
                if (err){
                    callback(err , null);
                }else{
                    callback(null , hops);
                }
            });
        }
    ], function (err, hops) {
        if (err){
            console.log(err);
        }else{
    	    cli.info("Something to do for me...("+dest+")");
	    specification.set_when(startAction.toISOString() + " ... " + new Date().toISOString());
            supervisor.registerResult(
                specification
                , {
                    host: configuration.supervisor.host
                    ,port: configuration.supervisor.port
                    ,caFile: configuration.ssl.ca
                    ,keyFile: configuration.ssl.key
                    ,certFile: configuration.ssl.cert
                },{
                    "delay.twoway":mean(hops),
                    "hops.ip":hops.length
                }
                ,function(err , data){
    	            cli.info("delay.twoway:"+mean(hops)+" - hops:"+hops.length);
                    mainCallback();
                    /*if (err)
                        mainCallback(err);
                    else{
                        mainCallback();
                    }*/
                }
            ); //supervisor.registerResult
        }
    }); //waterfall
}

function doAPing(destination , Wait , requests , callback){
    var pingCMD = "";
    switch (cli.options.platform){
        case "BSD":
            pingCMD = "ping -n -S " + cli.options.sourceIP + "  -W "+ Wait  +" -c " + requests + " " + destination  + " | grep from";
            break;
        case "MAC":
            pingCMD = "ping -n -S " + cli.options.sourceIP + "  -W "+ Wait*100  +" -c " + requests + " " + destination  + " | grep time";
	    break;
        case "LINUX":
            pingCMD = "ping -n -I " + cli.options.sourceIP + "  -W "+ Wait  +" -c " + requests + " " + destination  + " | grep time";
            break;
        default:
            throw (new Error("Unsupported platform "+cli.options.platform));

    }
 try{
 exec(pingCMD,
  function (error, stdout, stderr) {
      var times = [];
    if (!stdout)
        console.log("No answer")
    else{
        var replies = stdout.split(/\n/);
        _.each(replies , function(row , index){
            var vals = row.split(/[\t\s]+/);
            _.each(vals, function(el , index){
                var element = el.split("=");
                switch(element[0]){
                    case "time":
                        if (!_.isUndefined(element[1]))
                            times.push(element[1]);
                        break;
                    default:
                        // nothing to do here
                }
            });
        });
        callback(null, mean(times));
    }
    if (error !== null) {
      callback(error , null);
    }
  });
 }catch(e){
	console.log(e)
}
}

function doATrace(destination , callback){
    exec(configuration.main.tracerouteExec + " " + configuration.main.tracerouteOptions + " -s " + cli.options.sourceIP + " " + destination,
        function (error, stdout, stderr) {
            var delays = [];
            if (error || !stdout){
                callback(null , null);
                console.log("No answer");
            }
            else{
                var rows = stdout.split(/\n/);
                _.each(rows , function(row , index){
                    var vals = row.split(/[\t\s]+/);
                    // Simple and stupid check...
                    vals.forEach(function(val  , index){
                        if(val == "ms"){
                            delays.push(vals[index -1]);
                        }

                    });

                });
                callback(null, delays);
            }
        });
}
