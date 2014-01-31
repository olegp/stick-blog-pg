var Application = require("stick").Application;
var markdown = require('marked');
var pg = require("pg-sync");

var app = exports.app = new Application();

var DB_STRING = "postgres://postgres:postgres@localhost/blog";

app.configure(function(next, app) {
  return function(request) {
    request.db = new pg.Client(DB_STRING);
    var result = next(request);
    request.db.done();
    return result;
  }
}, "notfound", "render", "params", "route", "static");

app.render.base = "./lib/";
app.master = "blog-base.html";

var nonalnum = /[^0-9a-zA-Z]+/g;

function prettify(text) {
  return text.replace(nonalnum, '-').toLowerCase().replace(/^-*(.*?)-*$/, '$1');
}

function redirect(location) {
  return {
    status: 302,
    headers: { Location:location },
    body:[]
  };
}

app.renderParams = function(params) {
  return params;
}

app.get("/feed", function(request) {
  return app.render("blog-feed.xml", app.renderParams({
    posts: request.db.query("select * from posts order by created desc limit 10").rows.map(function(post) {
      post.html = markdown(post.body);
      post.created = new Date(post.created).toUTCString();
      return post;
    })
  }), {contentType:'application/rss+xml'});
});

app.get("/:slug", function(request, slug) {
  var post =  request.db.query("select * from posts where slug=$1 limit 1", slug).rows[0];
  if(post) {
    post.html = markdown(post.body);
    return app.render("blog-post.html", app.renderParams({
      post: post,
      posts: request.db.query("select title, slug from posts order by created").rows.map(function(p) {
        if(post.slug == slug) {
          p.current = true;
        }
        return p;
      })
    }), {master: app.master});
  } else {
    throw {notfound:true};
  }
});

app.get("/:slug/edit", function(request, slug) {
  app.auth && app.auth(request);
  return app.render("blog-edit.html",
    app.renderParams(slug == 'new' ? {} : request.db.query("select * from posts where slug=$1 limit 1", slug).rows[0]),
    {master: app.master});
});

app.get("/", function(request) {
  var slug = request.db.query("select slug from posts limit 1").rows[0].slug;
  return redirect("./" + slug);
});

app.post("/", function(request) {
  app.auth && app.auth(request);
  if('delete' in request.params) {
    request.db.query("delete from posts where slug=$1", request.params.slug);
  } else {
    var update = request.params;
    if(update.slug) {
      request.db.query("update posts set modified=$1, title=$2, body=$3 where slug=$4", new Date(), update.title, update.body, update.slug);
    } else {
      request.db.query("insert into posts (created, slug, title, body) values ($1, $2, $3, $4)", new Date(), prettify(update.title), update.title, update.body);
    }
  }
  return redirect("./");
});

