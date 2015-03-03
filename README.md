mplane_probe
=================

[![mPlane](http://www.ict-mplane.eu/sites/default/files//public/mplane_final_256x_0.png)](http://www.ict-mplane.eu/)


This package contains a working examples of a generic [mPlane](http://www.ict-mplane.eu/) acive probe integrate with mPlane protocol stack, over HTTPS transport.
The probe is capable of doing following measures:

	delay.twoway (icmp)
	delay.twoway (HTTP GET)
	hops.ip
	
A complete set of working SSL certificates is provided (with root-CA and signing-CA) [here](https://github.com/stepenta/RI/tree/master/PKI) in order to have a complete, full working environment. 
For security reasons you SHOULD update these files with your own certificates.

#Installation
Get all the code from github

```git clone https://github.com/finvernizzi/mplane_probe.git
```


Now you need to install all the nodejs dependencies

```
cd ./mplane_probe
npm install
```
Done. You are ready to run the three components.



##Configuration


Configuration of this probe can be done in probe.json
 
```json
{
    "main":{
        "logFile":"/var/log/mplane/pinger.log",
        "retryConnect":5000,
        "pingerLabel": "pinger_TI_test",
        "tracerouteLabel": "tracer_TI_test",
        "ipAdresses" : ["192.168.0.1"],
        "tracerouteExec": "/usr/sbin/traceroute",
        "tracerouteOptions": "-q1 -n -w1 -m5"
    },
    "supervisor":{
        "host": "mplane.org",
        "port": 2427
    },
    "ssl":{
        "key": "./ssl/official/Component1/Component-1-plaintext.key"
        ,"cert": "./ssl/official/Component1/Component-1.crt.pem"
        ,"ca": [ "./ssl/official/root-ca.pem" , "./ssl/official/signing-ca.pem" ]
        ,"requestCert" : true
    },
    "registry":{
		"url": "file://../registry.json"
    }
}
```

The implementation is very simple, and tested on FreeBSD (9.3) and Ubuntu 10.4, so some changes may be required in order to fully work on other platform.
In particular two functions should be checked:
- doAPing. This function executes the ping with parameters received in Specifications. The command is 
       ```javascript exec("ping -S " + __MY_IP__ + "  -W "+ Wait  +" -c " + requests + " " + destination  + " | grep from"```
    
- doATrace.This function executes the traceroute with parameters received in Specifications. The command is 
        ```javascript exec(configuration.main.tracerouteExec + " " + configuration.main.tracerouteOptions + " -s " + __MY_IP__ + " " + destination```
         
To run the probe:
```
node ./pinger
```

##LICENSE

This software is released under the [BSD](http://en.wikipedia.org/wiki/BSD_licenses#2-clause_license_.28.22Simplified_BSD_License.22_or_.22FreeBSD_License.22.29) license.
