/*============================================================================
 * FILE:    scriptures.js
 * AUTHOR:  Stephen W. Liddle
 * DATE:    Winter 2019
 *
 * DESCRIPTION: Front-end JavaScript code for The Scriptures, Mapped.
 *              IS 542, Winter 2019, BYU.
 */
/*jslint
    browser: true
*/
const Scriptures = (function() {
    "use strict"

    /*------------------------------------------------------------------------
     *                      CONSTANTS
     */

    const apiUrl = `https://scriptures.byu.edu/mapscrip/mapgetscrip.php`
    const LAT_LON_PARSER = /\((.*),'(.*)',(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*),'(.*)'\)/
    const index = {
        placename: 2,
        lat: 3,
        long: 4,
        flag: 11
    }
    const MAX_RETRY_DELAY = 5000

    /*------------------------------------------------------------------------
     *                      PRIVATE VARIABLES
     */
    let books
    let volumes
    let retryDelay = 500
    let markers = []

    /*------------------------------------------------------------------------
     *                      PRIVATE METHOD DECLARATIONS
     */
    let ajax
    let addMarker
    let bookChapterValid
    let cacheBooks
    let chapterFailure
    let chapterSuccess
    let clearMarkers
    let clearAndHideButton
    let encodedScripturesURL
    let init
    let navigateBook
    let navigateChapter
    let navigateHome
    let nextChapter
    let onHashChanged
    let previousChapter
    let setupMarkers
    let titleForBookChapter

    /*------------------------------------------------------------------------
     *                      PRIVATE METHODS
     */
    ajax = function(url, successCallback, failureCallback, skipParse = false) {
        let request = new XMLHttpRequest()

        request.open("GET", url, true)

        request.onload = function() {
            if (request.status >= 200 && request.status < 400) {
                let data = request.responseText

                if (!skipParse) {
                    data = JSON.parse(data)
                }

                if (typeof successCallback === "function") {
                    successCallback(data)
                }
            } else {
                if (typeof failureCallback === "function") {
                    failureCallback(request)
                }
            }
        }

        request.onerror = failureCallback
        request.send()
    }

    cacheBooks = function(callback) {
        volumes.forEach(function(volume) {
            let volumeBooks = []
            let bookId = volume.minBookId

            while (bookId <= volume.maxBookId) {
                volumeBooks.push(books[bookId])
                bookId += 1
            }

            volume.books = volumeBooks
        })

        if (typeof callback === "function") {
            callback()
        }
    }

    init = function(callback) {
        let booksLoaded = false
        let volumesLoaded = false

        ajax("https://scriptures.byu.edu/mapscrip/model/books.php", function(data) {
            books = data
            booksLoaded = true

            if (volumesLoaded) {
                cacheBooks(callback)
            }
        })
        ajax("https://scriptures.byu.edu/mapscrip/model/volumes.php", function(data) {
            volumes = data
            volumesLoaded = true

            if (booksLoaded) {
                cacheBooks(callback)
            }
        })
    }

    navigateHome = function(volumeId) {
        let navContents = `<div id="scripnav">`

        volumes.forEach(function(volume) {
            navContents += `<div class="volume"><a name="v${volume.id}"/>`
            navContents += `<h5>${volume.fullName}</h5></div>`
            navContents += `<div class="books">`
            volume.books.forEach(function(book) {
                navContents += `<a class="btn" id=${book.id} `
                navContents += `href="#${volume.id}:${book.id}">${book.gridName}`
                navContents += `</a>`
            })
            navContents += `</div>`
        })

        navContents += `<br /><br /></div>`
        document.getElementById("scriptures").innerHTML = navContents
    }

    navigateBook = function(bookId) {
        let book = books[bookId]

        let chapterCount = book.numChapters

        if (chapterCount === 0) {
            return navigateChapter(bookId, 0)
        }
        if (chapterCount === 1) {
            return navigateChapter(bookId, 1)
        }

        let navContents = `<div id="scripnav">`

        navContents += `<div class="volume">`
        navContents += `<h5>${book.fullName}</h5></div>`
        navContents += `<div class="books">`
        for (const chapter of Array(chapterCount).keys()) {
            let chapterName = `${chapter + 1}`
            navContents += `<a class="btn chapter" id="${chapterName}" `
            navContents += `href="#0:${book.id}:${chapterName}">${chapterName}`
            navContents += `</a>`
        }

        navContents += `</div></div>`
        document.getElementById("scriptures").innerHTML = navContents
    }

    chapterFailure = function() {
        console.log("Error getting Scripture Content from API")
    }

    chapterSuccess = function(chapterHTML) {
        document.getElementById("scriptures").innerHTML = chapterHTML
        setupMarkers()
    }

    encodedScripturesURL = function(bookId, chapter, verses, isJST) {
        if (bookId !== undefined && chapter !== undefined) {
            let options = ""

            if (verses !== undefined) {
                options += verses
            }

            if (isJST !== undefined && isJST) {
                options += `&jst=JST`
            }

            return `${apiUrl}?book=${bookId}&chap=${chapter}&verses=${options}`
        }
    }

    navigateChapter = function(bookId, chapterId) {
        if (bookId !== undefined) {
            let book = books[bookId]
            let volume = volumes[book.parentBookId - 1]

            ajax(
                encodedScripturesURL(bookId, chapterId),
                chapterSuccess,
                chapterFailure,
                true
            )

            // Update Next and previous

            let nextChapterDetails = nextChapter(bookId, chapterId)
            let prevChapterDetails = previousChapter(bookId, chapterId)

            let button = document.getElementById("nextButton")
            if (nextChapterDetails) {
                button.href = `#0:${nextChapterDetails[0]}:${nextChapterDetails[1]}`
                button.title = nextChapterDetails[2]
                button.style.visibility = "visible"
            } else {
                clearAndHideButton(button)
            }

            button = document.getElementById("previousButton")
            if (prevChapterDetails) {
                button.href = `#0:${prevChapterDetails[0]}:${prevChapterDetails[1]}`
                button.title = prevChapterDetails[2]
                button.style.visibility = "visible"
            } else {
                clearAndHideButton(button)
            }
        }
    }

    clearAndHideButton = function(button) {
        button.href = `#`
        button.title = ""
        button.style.visibility = "hidden"
    }

    bookChapterValid = function(bookId, chapter) {
        let book = books[bookId]

        if (book === undefined || chapter < 0 || chapter > book.numChapters) {
            return false
        }

        if (book.numChapters > 0 && chapter == 0) {
            return false
        }

        return true
    }

    nextChapter = function(bookId, chapter) {
        let book = books[bookId]
        if (book !== undefined) {
            if (chapter < book.numChapters) {
                return [book.id, chapter + 1, titleForBookChapter(book, chapter + 1)]
            }

            let nextBook = books[bookId + 1]

            if (nextBook) {
                let nextChapter = 0
                if (nextBook.numChapters > 0) {
                    nextChapter = 1
                }
                return [
                    nextBook.id,
                    nextChapter,
                    titleForBookChapter(nextBook, nextChapter)
                ]
            }
        }
    }

    previousChapter = function(bookId, chapter) {
        let book = books[bookId]
        if (book !== undefined) {
            if (chapter > 1 && chapter <= book.numChapters) {
                return [book.id, chapter - 1, titleForBookChapter(book, chapter - 1)]
            }

            let previousBook = books[bookId - 1]

            if (previousBook) {
                let nextChapter = previousBook.numChapters
                if (previousBook.numChapters === 0) {
                    nextChapter = 0
                }
                return [
                    previousBook.id,
                    nextChapter,
                    titleForBookChapter(previousBook, nextChapter)
                ]
            }
        }
    }

    titleForBookChapter = function(book, chapter) {
        if (chapter > 0) {
            return book.tocName + " " + chapter
        }

        return book.tocName
    }

    onHashChanged = function() {
        let ids = []

        if (location.hash !== "" && location.hash.length > 1) {
            ids = location.hash.substring(1).split(":")
        }

        if (ids.length <= 0) {
            navigateHome()
        } else if (ids.length === 1) {
            let volumeId = Number(ids[0])

            if (volumeId < volumes[0].id || volumeId > volumes.slice(-1).id) {
                navigateHome()
            } else {
                navigateHome(volumeId)
            }
        } else if (ids.length >= 2) {
            let bookId = Number(ids[1])
            if (books[bookId] === undefined) {
                navigateHome()
            } else {
                if (ids.length === 2) {
                    navigateBook(bookId)
                } else {
                    let chapter = Number(ids[2])
                    if (bookChapterValid(bookId, chapter)) {
                        navigateChapter(bookId, chapter)
                    } else {
                        navigateHome()
                    }
                }
            }
        }
    }

    addMarker = function(lat, long, name) {
        // Check if Marker exists
        let position = new google.maps.LatLng(lat, long)

        let found = markers.find(function(element) {
            let pos = element.getPosition()
            return position.equals(pos)
        })

        if (!found) {
            let marker = new google.maps.Marker({
                position: { lat: lat, lng: long },
                map: map,
                title: name,
                label: {
                    fontWeight: "bold",
                    text: name
                },
                animation: google.maps.Animation.DROP
            })
            markers.push(marker)

            return marker
        }
    }

    clearMarkers = function() {
        markers.forEach(function(marker) {
            marker.setMap(null)
        })
        markers = []
    }

    setupMarkers = function() {
        if (window.google === undefined) {
            //Retry after delay
            let retry = window.setTimeout(setupMarkers, retryDelay)

            retryDelay += retryDelay

            if (retryDelay > MAX_RETRY_DELAY) {
                window.clearTimeout(retry)
                console.log("Loading Failure for google")
            }

            return
        }

        if (markers.length > 0) {
            //Clear Existing ones
            clearMarkers()
        }

        let bounds = new google.maps.LatLngBounds()

        document
            .querySelectorAll('a[onclick^="showLocation("]')
            .forEach(function(element) {
                let val = element.getAttribute("onclick")
                let matches = LAT_LON_PARSER.exec(val)

                if (matches) {
                    let placename = matches[index.placename]
                    let lat = parseFloat(matches[index.lat])
                    let long = parseFloat(matches[index.long])
                    let flag = matches[index.flag]

                    if (flag !== "") {
                        placename += " " + flag
                    }

                    let marker = addMarker(lat, long, placename)
                    if (marker) {
                        bounds.extend(marker.getPosition())
                    }
                }
            })

        // Zoom to the bounds

        map.fitBounds(bounds)
    }

    /*------------------------------------------------------------------------
     *                      PUBLIC API
     */
    return {
        init: init,
        onHashChanged: onHashChanged
    }
})()
