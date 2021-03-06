// MIT License / Copyright 2015
"use strict";

const weave = require( '..' )
const garden = require( 'gardens' ).createScope( 'weave.App' )

const { EventEmitter } = require( 'events' )
const path = require( 'path' )
const Spirit = require( 'string-spirits' )

class App extends EventEmitter {
  constructor( options ) {
    // Make it an EventEmitter
    super()

    this.options = Object.assign( {
      urlCleaning: 'true',
      headers: { 'X-Powered-By': 'Weave' },
      // indexes: {},
      // extensions: [],
      // mimeTypes: {},
      // errorPages: {},
      htmlDirectoryListings: false,
      jsonDirectoryListings: false
    }, options )

    this.mounts = {}
    this._mountPaths = {}
    this._resolvedPaths = {}
  }

  _normalizeMountPath( mountUrl ) {
    // Keep things consistent on Windows with other platforms.
    // Make sure that we don't store an ending slash on directories.
    // If /abc/ is configured, and /abc is requested, we should round up.
    return mountUrl.replace( /\\/g, '/' ).replace( /\/$/, '' )
  }

  link( binding, hostname = '*' ) {
    // If host is a port number, it will handle the entire port.
    // If it is not a port number or a string, it is invalid.
    if ( typeof hostname !== 'string' ) throw garden.typeerror( 'Hostname must be a string.' )

    // If the host is already taken, abandon ship.
    if ( binding.attachments[ hostname ] ) throw garden.error( `${hostname}:${binding.port} already in use!` )

    // If the host is a wildcard then clear all wildcardMatches that match
    // it. If it's a literal, clear wildcardMatches for that literal.
    if ( /\*/.test( hostname ) ) {
      let wildcard = new Spirit( hostname )
      Object.keys( binding.cachedMatches ).forEach( cachedhost => {
        if ( wildcard.match( binding.cachedMatches[ cachedhost ] ) ) binding.cachedMatches[ cachedhost ] = null })
    } else if ( binding.cachedMatches[ hostname ] ) binding.cachedMatches[ hostname ] = null

    binding.attachments[ hostname ] = this

    if ( binding._active ) this.emit( 'ready', { binding, hostname } )
    else binding.server.on( 'listening', () => this.emit( 'ready', { binding, hostname } ))

    // Return this from all configuration methods so they can be chained.
    return this
  }

  mount( mountUrl, app ) {
    if ( typeof mountUrl !== 'string' ) throw garden.typeerror( 'Argument mountUrl must be a string!' )
    if ( !path.isAbsolute( mountUrl ) ) throw garden.error( 'Argument mountUrl must be absolute!' )
    if ( mountUrl.length < 2 ) throw garden.error( 'Root is not a mountable url!' )
    if ( !(app instanceof weave.App) ) throw garden.typeerror( 'You can only mount apps!' )
    mountUrl = this._normalizeMountPath( mountUrl )

    // Clear the cache so that the configuration can be modified and
    // not conflict with previously cached requests.
    this._mountsPaths = {}

    // Check to make sure that the given mountUrl does not overlap with any
    // current mounts. If it is, we should ask the user to nest the mounts.
    let overlap = Object.keys( this.mounts ).some( mount => mount.startsWith( mountUrl + '/' ) || mountUrl.startsWith( mount + '/' ))
    if ( overlap ) throw garden.error( `Mounting in "${mountUrl}" would cause overlap with the existing mount "${overlap}". Nesting should be used instead.` )

    // Inherit options from the parent app, and mount it
    app.options._super = this.options
    this.mounts[ mountUrl ] = app

    // Return this from all configuration methods so they can be chained.
    return this
  }

  intercept( mountUrl, handle, method = 'default' ) {
    if ( typeof mountUrl !== 'string' ) throw garden.typeerror( 'Argument mountUrl must be a string!' )
    if ( !path.isAbsolute( mountUrl ) ) throw garden.error( 'Argument mountUrl must be absolute!' )
    if ( typeof handle !== 'function' ) throw garden.typeerror( `Argument handle must be a function! (${ mountUrl })` )
    mountUrl = this._normalizeMountPath( mountUrl )

    // Check to make sure that the given mountUrl does not overlap with any
    // current mounts. If it is, we should ask the user to nest the mounts.
    let overlap = Object.keys( this.mounts ).some( mount => mount.startsWith( `${mountUrl}/` ) || mountUrl.startsWith( `${mount}/` ))
    if ( overlap ) throw garden.error( `Intercepting in "${mountUrl}" would cause overlap with the existing intercept "${overlap}". Nesting should be used instead.` )

    // If there is already an interface at this path, we might be able to
    // attach to a different request method. If not, create a new wrapper.
    if ( !this.mounts[ mountUrl ] ) this.mounts[ mountUrl ] = { type: 'intercept' }
    // Mount the intercept
    this.mounts[ mountUrl ][ method ] = handle

    // Return this from all configuration methods so they can be chained.
    return this
  }
}

void [ 'get', 'post', 'head', 'put', 'delete',
  'connect', 'options', 'trace' ].forEach( method => {
  App.prototype[ method ] = function ( mountUrl, handle ) {
    this.intercept( mountUrl, handle, method )
  }
})

weave.App = App
