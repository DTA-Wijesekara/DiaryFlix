const express=require('express');
const {query,transaction}=require('../db');
const {authenticateJWT,asyncHandler,HttpError,assertDate,assertString}=require('../middleware');
const {randomUUID}=require('node:crypto');
const {requireSeries,upsertCatalog}=require('../lib/tv');
const router=express.Router();
router.use(authenticateJWT);

router.get('/:id',asyncHandler(async(req,res)=>{
  const movieId=req.params.id,userId=req.user.id;
  const own=(await query("SELECT id FROM movies WHERE id=@movieId AND user_id=@userId AND type='tv_series'",{movieId,userId})).rows[0];
  if(!own) throw new HttpError(404,'Series not found');
  const episodes=(await query(`SELECT e.id,s.number AS "seasonNumber",e.number AS "episodeNumber",e.title,e.runtime,
    e.tmdb_id::float8 AS "tmdbId",to_char(e.air_date,'YYYY-MM-DD') AS "airDate",
    (SELECT COUNT(*)::int FROM watchlogs w WHERE w.episode_id=e.id AND w.user_id=@userId) AS "watchCount"
    FROM tv_episodes e JOIN tv_seasons s ON s.id=e.season_id WHERE e.movie_id=@movieId AND e.user_id=@userId
    ORDER BY s.number,e.number`,{movieId,userId})).rows;
  const tracking=(await query('SELECT status,series_ended AS "seriesEnded",catalog_complete AS "catalogComplete",catalog_updated_at AS "catalogUpdatedAt" FROM tv_tracking WHERE movie_id=@movieId AND user_id=@userId',{movieId,userId})).rows[0]||{status:'watching',catalogComplete:false,seriesEnded:false};
  const today=new Date().toISOString().slice(0,10);
  const released=episodes.filter(e=>e.seasonNumber>0&&e.airDate&&e.airDate<=today);
  const watched=released.filter(e=>e.watchCount>0).length;
  const allReleased=episodes.filter(e=>e.seasonNumber>0).every(e=>e.airDate&&e.airDate<=today);
  res.json({...tracking,episodes,progress:{watched,total:released.length,nextEpisode:released.find(e=>!e.watchCount)||null,
    caughtUp:tracking.catalogComplete&&released.length>0&&watched===released.length,
    finished:tracking.catalogComplete&&tracking.seriesEnded&&allReleased&&released.length>0&&watched===released.length}});
}));

router.put('/:id/catalog',asyncHandler(async(req,res)=>{
  if(!Array.isArray(req.body.episodes)||req.body.episodes.length>500) throw new HttpError(400,'Send at most 500 episodes per catalog batch');
  await transaction(async()=>{
    await requireSeries(req.params.id,req.user.id);
    await upsertCatalog(req.params.id,req.user.id,req.body.episodes);
    // Completion is opt-in after all batches have loaded; unknown or partial catalogs stay partial.
    await query(`INSERT INTO tv_tracking(movie_id,user_id,catalog_updated_at) VALUES(@id,@userId,NOW())
      ON CONFLICT(movie_id) DO UPDATE SET catalog_updated_at=NOW(),catalog_complete=FALSE`,{id:req.params.id,userId:req.user.id});
    if(req.body.catalogComplete === true) {
      if(!Number.isInteger(req.body.expectedEpisodeCount) || req.body.expectedEpisodeCount<1) throw new HttpError(400,'Expected episode count is required');
      await query(`UPDATE tv_tracking SET catalog_complete=((SELECT COUNT(*) FROM tv_episodes WHERE movie_id=@id)=@count),series_ended=@ended WHERE movie_id=@id AND user_id=@userId`,{id:req.params.id,userId:req.user.id,count:req.body.expectedEpisodeCount,ended:req.body.seriesEnded===true});
    }
  });
  res.json({success:true});
}));
router.put('/:id/status',asyncHandler(async(req,res)=>{
  if(!['watching','on_hold','dropped','completed'].includes(req.body.status)) throw new HttpError(400,'Invalid series status');
  await transaction(async()=>{
    await requireSeries(req.params.id,req.user.id);
    await query(`INSERT INTO tv_tracking(movie_id,user_id,status) VALUES(@id,@userId,@status)
      ON CONFLICT(movie_id) DO UPDATE SET status=EXCLUDED.status`,{id:req.params.id,userId:req.user.id,status:req.body.status});
  });
  res.json({success:true});
}));
router.post('/:id/watches',asyncHandler(async(req,res)=>{
  const episodeIds=req.body.episodeIds;
  if(!Array.isArray(episodeIds)||!episodeIds.length||episodeIds.length>100||episodeIds.some(id=>typeof id!=='string')) throw new HttpError(400,'Choose between 1 and 100 episodes');
  const dateWatched=assertDate(req.body.dateWatched,'dateWatched');
  if(!dateWatched || dateWatched>new Date().toISOString().slice(0,10)) throw new HttpError(400,'Choose a watch date up to today');
  const requestId=assertString(req.body.requestId,'requestId',{min:16,max:100});
  const added=await transaction(async()=>{
    const movieId=req.params.id,userId=req.user.id;
    await query('SELECT id FROM users WHERE id=@userId FOR UPDATE',{userId});
    await requireSeries(movieId,userId);
    let count=0;
    for(const episodeId of new Set(episodeIds)) {
      const episode=(await query("SELECT runtime,to_char(air_date,'YYYY-MM-DD') AS air_date FROM tv_episodes WHERE id=@episodeId AND movie_id=@movieId AND user_id=@userId",{episodeId,movieId,userId})).rows[0];
      if(!episode) throw new HttpError(404,'Episode not found in this series');
      const airDate=episode.air_date;
      if(!airDate || airDate>dateWatched) throw new HttpError(400,'Bulk logging requires episodes released by the watch date');
      const result=await query(`INSERT INTO watchlogs(id,user_id,movie_id,episode_id,watched_minutes,client_request_id,date_watched)
        SELECT @id,@userId,@movieId,@episodeId,@minutes,@key,@dateWatched
        WHERE NOT EXISTS(SELECT 1 FROM watchlogs WHERE user_id=@userId AND episode_id=@episodeId)
        ON CONFLICT DO NOTHING`,{id:randomUUID(),userId,movieId,episodeId,minutes:episode.runtime,key:`${requestId}:${episodeId}`,dateWatched});
      count+=result.rowCount;
    }
    return count;
  });
  res.status(201).json({added,skipped:new Set(episodeIds).size-added});
}));
module.exports=router;
