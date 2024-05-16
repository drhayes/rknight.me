const marked = require('marked')
const sanitizeHTML = require('sanitize-html')
const moment = require('moment')
const slugify = require('slugify')
const cheerio = require('cheerio')
const { encode, decode } = require('html-entities')
const mastodonCount = require('./mastodonCounter.js')

const _getTypeEmoji = (type) => {
    const emoji = {
        book: '📚',
        movie: '🍿',
        tv: '📺',
        game: '🎮',
    }

    return emoji[type]
}

const _getVerb = (type) => {
    const verb = {
        book: 'Read',
        movie: 'Watched',
        tv: 'Watched',
        game: 'Finished',
    }

    return verb[type]
}

module.exports = {
    encodeUrl: (url) => {
        return encodeURIComponent(`https://rknight.me/opengraph${url}`)
    },
    trim: (string, limit) => {
        return string.length <= limit ? string : `${string.slice(0, limit)}...`
    },
    rssClubAlert: (content, rssClub) => {
        if (!rssClub) return content
        return `<p>Welcome to the Knight club - RSS-only posts. These only show for RSS subscribers but feel free to share them. <a href="https://daverupert.com/rss-club/">Read more about RSS club</a>.</p> <hr> ${content}`
    },
    makeSlugForOgImage: (url) => {
      return slugify(url, { lower: true })  
    },
    imageLink: (path) => {
        if (path.startsWith('https://cdn.rknight.me')) return path
        return `https://cdn.rknight.me/${path}`
    },
    toLowerCase: (string) => {
        return string.toLowerCase()
    },
    // usage {{ myObject | objectDebug | safe }}
    objectDebug: function(value) {
        return `<pre>${JSON.stringify(value, '', 2)}</pre>`
    },
    postPath: (path) => {
        if (path.includes('micro/')) return path
        return `/micro/${path}`
    },
    stripIndex: (path) => {
        if (!path) return ''
        return path.replace('/index.html', '/')
    },
    mdToHtml: (content) => {
        if (!content) return ''
        return marked.parse(content)
    },
    mdToHtmlInline: (content) => {
        if (!content) return ''
        return marked.parseInline(content)
    },
    getTypeEmoji: (type) => _getTypeEmoji(type),
    getPostEmoji: (data) => {
        if (data.layout === 'link')
        {
            return '🔗'
        }

        if (data.layout === 'changelog') 
        {
            return '⚙️'
        }

        if (data.layout === 'almanac')
        {
            return _getTypeEmoji(data.type)
        }

        return '🖊️'
    },
    getRssId: (post) => {
        if (moment(post.date).isBefore(moment('2023-12-23')))
        {
            return post.url.replace('/blog/', '/')
        }

        return post.url
    },
    getYouTubeLinks: (post) => {
        if (!post.links || post.links.length === 0)
        {
            return []
        }

        const youtubeIds = []

        post.links.forEach(l => {
            const matches = l.match(/(http:|https:)?\/\/(www\.)?(youtube.com|youtu.be)\/(watch)?(\?v=)?(\S+)?/)
            if (matches && matches[6])
            {
                youtubeIds.push(matches[6])
            }
        })

        return youtubeIds
    },
    attachmentOrCustomOg: (post) => {
        if (post && post.attachments && post.attachments.length > 0)
        {
            return post.attachments[0].url ? post.attachments[0].url : post.attachments[0]
        }
    
        return `https://rknight.me/assets/img/almanac/${post.fallback}.png`
    },
    getAllTags: (collection) => {
        let tagSet = new Set()
        for (let item of collection) {
            (item.data.tags || []).forEach((tag) => tagSet.add(tag))
        }
        return Array.from(tagSet)
    },
    popularPosts: (pageviews, limit, url) => {
        return pageviews.filter(pv => pv.url !== url).slice(0, limit)
    },
    oValues: (data) => {
        return Object.values(data)
    },
    sortByName: (arr) => {
        return arr.slice().sort((a, b) => {
            if (a.children.length > 0) {
                a.children = a.children.slice().sort((c, d) => {
                    return c.title.toLowerCase().localeCompare(d.title.toLowerCase())
                })
            }

            if (b.children.length > 0) {
                b.children = b.children.slice().sort((c, d) => {
                    return c.title.toLowerCase().localeCompare(d.title.toLowerCase())
                })
            }

            return a.title.toLowerCase().localeCompare(b.title.toLowerCase())
        });
    },
    makeTootText: (post) => {
        let content = ''
        const permalink = `https://rknight.me${post.permalink}`

        if (!['link', 'almanac', 'note'].includes(post.layout))
        {
            content = `${decode(post.title)} ${permalink}`

            return content
        }

        const $ = cheerio.load(`<div id="content">${decode(post.content)}</div>`)
        let allText = $('#content').text().trim()

        $('blockquote').get().forEach(element => {
            allText = allText.replace($(element).text().trim(), `"${$(element).text().trim()}"`)
        })

        if (post.layout === 'almanac')
        {
            let title = [
                _getTypeEmoji(post.type),
                `${_getVerb(post.type)}:`,
                decode(post.title),
                post.season ? `Season ${post.season}` : null,
                post.platform ? `(${post.platform})` : null,
            ].filter(t => t).join(' ')

            content = `${title} ${permalink}`

            const contentWithReview = `${content}\n\n${allText}`
            if (mastodonCount.getMastodonLength(contentWithReview).length <= 500)
            {
                content = contentWithReview
            }

            return content
        }

        if (post.layout === 'note') 
        {
            content = `${allText} ${permalink}`

            if (mastodonCount.getMastodonLength(content).length <= 476) 
            {
                return content
            }
        
            return `${content.slice(0, 476)}... ${permalink}`
        }

        let mastoUsername = null
        if (post.author.mastodon)
        {
            const url = new URL(post.author.mastodon)
            mastoUsername = `${url.pathname.replace('/', '')}@${url.host}`
        }

        content = `⭐ ${decode(post.title)} ${mastoUsername ? `by ${mastoUsername}` : ''} ${post.link}`

        const contentWithAllText = `${content}\n\n${allText}\n\n📌 ${permalink}`
        const firstQuote = `"${$('blockquote').first().text().trim()}"`
        const contentWithFirstQuote = `${content}\n\n${firstQuote}\n\n📌 ${permalink}`

        if (mastodonCount.getMastodonLength(contentWithAllText).length <= 500)
        {
            content = contentWithAllText
        } else if (mastodonCount.getMastodonLength(contentWithFirstQuote).length <= 500)
        {
            content = contentWithFirstQuote
        } else {
            content = `${content}\n\n📌 ${permalink}`
        }

        return content
    },
    getTitleForOg: (post) => {
        if (post.data.layout === 'almanac')
        {
            return `${_getTypeEmoji(post.data.type)} ${decode(post.data.title)}`
        }

        return decode(post.data.title)
    },
    getOgImageUrl: (page) => {
        if (page.attachments && page.attachments.length > 0)
        {
            return page.attachments[0].url ? page.attachments[0].url : page.attachments[0]
        }

        let path = page.url
        if (path.startsWith('/notes/') && path !== '/notes/') {
            path = '/notes/single/'
        }
        const url = encodeURIComponent(`https://rknight.me/opengraph${path}`)
        return `https://v1.screenshot.11ty.dev/${url}/opengraph`
    }
}
