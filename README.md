# stserveruploader
**StServer** mission uploader


## Uploading missions
In addition to manual mission creation, it is possible to automate the process and upload a large number of content (locally available or uploaded from remote). 
### uploadProc


```
   node uploadProc.js -i ./tests/missions.csv -s http://localhost:8080  -u superAdmin -p 123456
```

- -i  Input configuration file path
- -s  Server url
- -u  User name
- -p  Password

Configuration file (.csv or json) provides a list of missions to be created and the location of the content to upload.

Upload utility will first check the local machine and upload, if found. If not, just pass the path, so the server would try to locate it at its end.

